// Данные раздела D: счётчики профиля, совпадения, скрытые авторы, удаление аккаунта
import { supabase } from './supabase';
import type { Photo, Profile } from './types';
import { cachePhotos } from './photos';

export type Stats = { moments: number; likes: number; places: number };

export async function fetchStats(uid: string): Promise<Stats> {
  const { data, error } = await supabase.rpc('profile_stats', { uid });
  if (error) throw error;
  const r = (data?.[0] ?? {}) as { moments?: number; likes?: number; places?: number };
  return { moments: Number(r.moments ?? 0), likes: Number(r.likes ?? 0), places: Number(r.places ?? 0) };
}

export type Match = {
  my_photo_id: string;
  my_storage_path: string;
  my_taken_at: string;
  my_lat: number;
  my_lng: number;
  other_photo_id: string;
  other_storage_path: string;
  other_taken_at: string;
  other_lat: number;
  other_lng: number;
  other_user_id: string;
  other_username: string | null;
  other_name: string | null;
  other_avatar: string | null;
  place_name: string | null;
  distance_m: number;
  minutes_apart: number;
  confirmed?: boolean; // «Это я» (12.10)
};

// Последний загруженный список — чтобы D2 открывался мгновенно из D1
let lastMatches: Match[] = [];
export const matchKey = (m: Match) => `${m.my_photo_id}:${m.other_photo_id}`;
export const cachedMatches = () => lastMatches;
export const cachedMatch = (key: string) => lastMatches.find((m) => matchKey(m) === key) ?? null;

/** Совпадения: чужое фото не дальше ~100 м и ±15 минут от вашего. Свежие — первыми, по одному на каждое ваше фото */
export async function fetchMatches(): Promise<Match[]> {
  const { data, error } = await supabase.rpc('my_matches_v2', { radius_m: 100, window_min: 15, max_rows: 200 });
  if (error) throw error;
  const seen = new Set<string>();
  const list = ((data ?? []) as Match[]).filter((m) => {
    const k = `${m.my_photo_id}:${m.other_user_id}`; // одно совпадение на пару «моё фото — автор»
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  // «Это я» — подтверждённые совпадения первыми (порядок внутри групп — как пришёл, свежие сверху)
  const { data: conf } = await supabase.from('match_confirmations').select('my_photo_id,other_photo_id');
  const ok = new Set((conf ?? []).map((c: any) => `${c.my_photo_id}:${c.other_photo_id}`));
  for (const m of list) m.confirmed = ok.has(matchKey(m));
  const sorted = [...list.filter((m) => m.confirmed), ...list.filter((m) => !m.confirmed)];
  lastMatches = sorted;
  return sorted;
}

/** «Это не я — скрыть»: совпадение больше не показываем никогда */
/** «Это я» / отмена: отметка только для себя, автор её не видит */
export async function setMatchConfirmed(uid: string, m: Match, on: boolean) {
  const q = supabase.from('match_confirmations');
  const { error } = on
    ? await q.insert({ user_id: uid, my_photo_id: m.my_photo_id, other_photo_id: m.other_photo_id })
    : await q.delete().eq('user_id', uid).eq('my_photo_id', m.my_photo_id).eq('other_photo_id', m.other_photo_id);
  if (error && error.code !== '23505') throw error;
  const k = matchKey(m);
  lastMatches = lastMatches.map((x) => (matchKey(x) === k ? { ...x, confirmed: on } : x));
  lastMatches = [...lastMatches.filter((x) => x.confirmed), ...lastMatches.filter((x) => !x.confirmed)];
}

export async function dismissMatch(uid: string, m: Match) {
  const { error } = await supabase.from('match_dismissals').insert({ user_id: uid, my_photo_id: m.my_photo_id, other_photo_id: m.other_photo_id });
  if (error && error.code !== '23505') throw error;
  lastMatches = lastMatches.filter((x) => matchKey(x) !== matchKey(m));
}

export async function fetchProfile(id: string): Promise<Profile | null> {
  const { data } = await supabase.from('profiles').select('id,username,display_name,avatar_url,bio,city,created_at').eq('id', id).maybeSingle();
  return (data as Profile) ?? null;
}

/** Снимки автора с лайками (для D3 / D1) */
export async function fetchAuthorPhotos(uid: string): Promise<Photo[]> {
  const { data, error } = await supabase
    .from('photos')
    .select('id,user_id,storage_path,width,height,taken_at,lat,lng,place_name,caption,like_count,hidden,private')
    .eq('user_id', uid)
    .eq('hidden', false)
    .order('taken_at', { ascending: false })
    .limit(300);
  if (error) throw error;
  const list = (data ?? []).map((r: any) => ({ ...r, author_username: null, author_name: null, author_avatar: null })) as Photo[];
  cachePhotos(list);
  return list;
}

export type HiddenAuthor = { id: string; name: string; username: string | null; avatar: string | null };

export async function fetchHiddenAuthors(uid: string): Promise<HiddenAuthor[]> {
  const { data, error } = await supabase
    .from('hidden_authors')
    .select('hidden_user_id, profiles!hidden_authors_hidden_user_id_fkey(username,display_name,avatar_url)')
    .eq('user_id', uid)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.hidden_user_id,
    name: r.profiles?.display_name || r.profiles?.username || 'Автор',
    username: r.profiles?.username ?? null,
    avatar: r.profiles?.avatar_url ?? null,
  }));
}

export async function unhideAuthor(uid: string, authorId: string) {
  const { error } = await supabase.from('hidden_authors').delete().eq('user_id', uid).eq('hidden_user_id', authorId);
  if (error) throw error;
}

export async function setMatchesEnabled(uid: string, on: boolean) {
  const { error } = await supabase.from('profiles').update({ matches_enabled: on }).eq('id', uid);
  if (error) throw error;
}

export async function fetchMatchesEnabled(uid: string): Promise<boolean> {
  const { data } = await supabase.from('profiles').select('matches_enabled').eq('id', uid).maybeSingle();
  return data?.matches_enabled ?? true;
}

/** D6: стираем свои файлы в хранилище (снимки и все аватары), затем аккаунт — остальное удалится каскадом */
export async function deleteAccount(uid: string) {
  const bucket = supabase.storage.from('photos');
  for (;;) {
    const { data, error } = await bucket.list(uid, { limit: 100 });
    if (error) throw error;
    const files = (data ?? []).filter((f) => f.id).map((f) => `${uid}/${f.name}`);
    if (!files.length) break;
    const rm = await bucket.remove(files);
    if (rm.error) throw rm.error;
    if (files.length < 100) break;
  }
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw error;
  await supabase.auth.signOut();
}

// ── форматирование ──
/** «@NICK · ГОРОД», только ник или только город; пусто — '' */
export const nickLine = (p: Pick<Profile, 'username' | 'city'> | null | undefined) =>
  [p?.username ? `@${p.username}` : '', p?.city ?? ''].filter(Boolean).join(' · ').toUpperCase();
const MON = ['ЯНВ', 'ФЕВ', 'МАР', 'АПР', 'МАЯ', 'ИЮН', 'ИЮЛ', 'АВГ', 'СЕН', 'ОКТ', 'НОЯ', 'ДЕК'];
const MON_LOW = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const pad = (n: number) => String(n).padStart(2, '0');
export const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const dayUpper = (d: Date) => `${pad(d.getDate())} ${MON[d.getMonth()]} ${d.getFullYear()}`;
export const dayLower = (d: Date) => `${d.getDate()} ${MON_LOW[d.getMonth()]} ${d.getFullYear()}`;
export const monthYearUpper = (d: Date) => `${MON[d.getMonth()]} ${d.getFullYear()}`;

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** 312 → «312», 2400 → «2,4K», 12 500 → «12K» */
export function compact(n: number) {
  if (n < 1000) return String(n);
  if (n < 10000) return `${(n / 1000).toFixed(1).replace('.', ',').replace(',0', '')}K`;
  return `${Math.round(n / 1000)}K`;
}

/** «Анна Лебедева» → «Анне»: дательный падеж для «Вы могли попасть в кадр к …» (простые правила для имени) */
export function dative(fullName: string) {
  const first = fullName.trim().split(/\s+/)[0] ?? fullName;
  if (/[ая]$/i.test(first)) return first.replace(/а$/i, 'е').replace(/я$/i, first.endsWith('ия') ? 'и' : 'е');
  if (/й$/i.test(first)) return first.replace(/й$/i, 'ю');
  if (/ь$/i.test(first)) return first.replace(/ь$/i, 'ю');
  if (/[бвгджзклмнпрстфхцчшщ]$/i.test(first)) return first + 'у';
  return first;
}

/** «Анна Лебедева» → «Анны» (родительный — «Посмотреть фото Анны») */
export function genitive(fullName: string) {
  const first = fullName.trim().split(/\s+/)[0] ?? fullName;
  if (/[гкхжчшщ]а$/i.test(first)) return first.replace(/а$/i, 'и');
  if (/а$/i.test(first)) return first.replace(/а$/i, 'ы');
  if (/я$/i.test(first)) return first.replace(/я$/i, 'и');
  if (/й$/i.test(first)) return first.replace(/й$/i, 'я');
  if (/ь$/i.test(first)) return first.replace(/ь$/i, 'я');
  if (/[бвгджзклмнпрстфхцчшщ]$/i.test(first)) return first + 'а';
  return first;
}
