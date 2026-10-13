import { decode } from 'base64-arraybuffer';
import { DEMO_IMAGES } from './demoImages';
import { supabase } from './supabase';
import { STEP_INTERVAL, type Granularity } from './time';
import type { Bounds, Photo, TimeWindow } from './types';

// Кэш, чтобы экран фото открывался мгновенно после карты
const cache = new Map<string, Photo>();
export const cachePhotos = (list: Photo[]) => list.forEach((p) => cache.set(p.id, p));
export const cachedPhoto = (id: string) => cache.get(id);

/** Источник картинки для expo-image: демо-снимки лежат в самом приложении (demo://demo-01) */
export function photoSource(path: string): number | { uri: string } {
  if (path.startsWith('demo://')) {
    const local = DEMO_IMAGES[path.slice('demo://'.length)];
    if (local) return local;
  }
  return { uri: photoUrl(path) };
}

export function photoUrl(path: string): string {
  if (path.startsWith('http')) return path;
  return supabase.storage.from('photos').getPublicUrl(path).data.publicUrl;
}

export async function fetchPhotosInView(b: Bounds, window: TimeWindow | null, limit = 300): Promise<Photo[]> {
  const { data, error } = await supabase.rpc('photos_in_view', {
    min_lat: b.minLat,
    min_lng: b.minLng,
    max_lat: b.maxLat,
    max_lng: b.maxLng,
    from_ts: window?.from.toISOString() ?? null,
    to_ts: window?.to.toISOString() ?? null,
    max_rows: limit,
  });
  if (error) throw error;
  const list = (data ?? []) as Photo[];
  cachePhotos(list);
  return list;
}

/** Сколько фото в каждом интервале шкалы: ключ — начало интервала в мс */
export async function fetchTimeBuckets(b: Bounds, g: Granularity, from: Date, to: Date, origin: Date) {
  const { data, error } = await supabase.rpc('photo_time_buckets', {
    min_lat: b.minLat,
    min_lng: b.minLng,
    max_lat: b.maxLat,
    max_lng: b.maxLng,
    from_ts: from.toISOString(),
    to_ts: to.toISOString(),
    bucket: STEP_INTERVAL[g],
    origin: origin.toISOString(),
  });
  if (error) throw error;
  const map = new Map<number, number>();
  for (const row of (data ?? []) as { bucket_start: string; photo_count: number }[]) {
    map.set(new Date(row.bucket_start).getTime(), Number(row.photo_count));
  }
  return map;
}

const SELECT_WITH_AUTHOR =
  'id,user_id,storage_path,width,height,taken_at,lat,lng,place_name,caption,private,profiles!photos_user_id_fkey(username,display_name,avatar_url)';

function flatten(row: any): Photo {
  const { profiles, ...rest } = row;
  return {
    ...rest,
    author_username: profiles?.username ?? null,
    author_name: profiles?.display_name ?? null,
    author_avatar: profiles?.avatar_url ?? null,
  };
}

export async function fetchPhoto(id: string): Promise<Photo | null> {
  const hit = cache.get(id);
  if (hit) return hit;
  const { data, error } = await supabase.from('photos').select(SELECT_WITH_AUTHOR).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const p = flatten(data);
  cache.set(p.id, p);
  return p;
}

export async function fetchUserPhotos(userId: string): Promise<Photo[]> {
  const { data, error } = await supabase
    .from('photos')
    .select(SELECT_WITH_AUTHOR)
    .eq('user_id', userId)
    .order('taken_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  const list = (data ?? []).map(flatten);
  cachePhotos(list);
  return list;
}

export type NewPhoto = {
  base64: string;
  mimeType: string;
  width: number;
  height: number;
  takenAt: Date;
  lat: number;
  lng: number;
  locationSource: 'exif' | 'device' | 'manual';
  placeName: string | null;
  caption: string | null;
  private?: boolean; // «Только мне»
};

/** Одна публикация = один id момента и один путь файла на все повторы (12.10).
 *  Если ответ сервера потерялся, повтор не создаёт дубль и не удаляет уже записанный снимок. */
export type PublishKey = { id: string; path: string; uploaded: boolean };
const uuid4 = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
export function newPublishKey(userId: string, mimeType: string): PublishKey {
  const ext = mimeType.includes('png') ? 'png' : mimeType.includes('heic') ? 'heic' : 'jpg';
  return { id: uuid4(), path: `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`, uploaded: false };
}
/** Обрыв связи: запрос мог дойти до сервера, просто ответ не вернулся */
const netError = (e: any) => /network|fetch|timed? ?out|offline|connection|abort/i.test(`${e?.name ?? ''} ${e?.message ?? ''}`);

export async function uploadPhoto(userId: string, p: NewPhoto, key?: PublishKey): Promise<string> {
  const k = key ?? newPublishKey(userId, p.mimeType);
  if (!k.uploaded) {
    const up = await supabase.storage.from('photos').upload(k.path, decode(p.base64), { contentType: p.mimeType, upsert: false });
    // «уже есть» — прошлая попытка файл загрузила, ответ просто не дошёл
    const exists = up.error && (/exist|duplicate/i.test(up.error.message) || String((up.error as any).statusCode) === '409');
    if (up.error && !exists) throw up.error;
    k.uploaded = true;
  }
  const { error } = await supabase.from('photos').insert({
    id: k.id,
    user_id: userId,
    storage_path: k.path,
    width: p.width,
    height: p.height,
    taken_at: p.takenAt.toISOString(),
    lat: p.lat,
    lng: p.lng,
    location_source: p.locationSource,
    place_name: p.placeName,
    caption: p.caption,
    private: !!p.private,
  });
  if (error) {
    if (error.code === '23505') return k.id; // момент уже записан прошлой попыткой
    // сервер отказал — файл больше не нужен; обрыв связи — оставляем: запись могла пройти
    if (!netError(error)) {
      await supabase.storage.from('photos').remove([k.path]);
      k.uploaded = false;
    }
    throw error;
  }
  return k.id;
}

export async function deletePhoto(p: Photo) {
  const { error } = await supabase.from('photos').delete().eq('id', p.id);
  if (error) throw error;
  if (!p.storage_path.startsWith('http')) await supabase.storage.from('photos').remove([p.storage_path]);
  cache.delete(p.id);
}

// ---------- v2: лайки, скрытые авторы, моменты ----------

/** Фото в области за промежуток (без скрытых и без скрытых авторов), с лайками */
export async function fetchPhotosV2(b: Bounds, from: Date | null, to: Date | null, limit = 600): Promise<Photo[]> {
  const { data, error } = await supabase.rpc('photos_in_view_v2', {
    min_lat: b.minLat,
    min_lng: b.minLng,
    max_lat: b.maxLat,
    max_lng: b.maxLng,
    from_ts: from?.toISOString() ?? null,
    to_ts: to?.toISOString() ?? null,
    max_rows: limit,
  });
  if (error) throw error;
  const list = (data ?? []) as Photo[];
  cachePhotos(list);
  return list;
}

/** Самое свежее фото в области — чтобы открыть шкалу там, где что-то есть */
export async function fetchLatestIn(b: Bounds): Promise<Photo | null> {
  const list = await fetchPhotosV2(b, null, null, 1);
  return list[0] ?? null;
}

/** Квадрат вокруг точки: радиус в метрах */
export function boundsAround(lat: number, lng: number, meters: number): Bounds {
  const dLat = meters / 111_320;
  const dLng = meters / (111_320 * Math.cos((lat * Math.PI) / 180));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}

export async function fetchPhotoFull(id: string, userId?: string | null): Promise<Photo | null> {
  const { data, error } = await supabase
    .from('photos')
    .select('id,user_id,storage_path,width,height,taken_at,lat,lng,place_name,caption,like_count,hidden,private,profiles!photos_user_id_fkey(username,display_name,avatar_url)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { profiles, ...rest } = data as any;
  let liked = false;
  if (userId) {
    const { count } = await supabase.from('likes').select('photo_id', { count: 'exact', head: true }).eq('photo_id', id).eq('user_id', userId);
    liked = (count ?? 0) > 0;
  }
  const p: Photo = {
    ...rest,
    liked_by_me: liked,
    author_username: profiles?.username ?? null,
    author_name: profiles?.display_name ?? null,
    author_avatar: profiles?.avatar_url ?? null,
  };
  cachePhotos([p]);
  return p;
}

/** «Только мне» / «Видно всем» для своего снимка (13.10) */
export async function setPhotoPrivate(photoId: string, on: boolean) {
  const { error } = await supabase.from('photos').update({ private: on }).eq('id', photoId);
  if (error) throw error;
  const c = cache.get(photoId);
  if (c) c.private = on;
}

export async function setLike(photoId: string, userId: string, like: boolean) {
  const q = like
    ? supabase.from('likes').insert({ photo_id: photoId, user_id: userId })
    : supabase.from('likes').delete().eq('photo_id', photoId).eq('user_id', userId);
  const { error } = await q;
  if (error && !(like && error.code === '23505')) throw error; // повторный лайк — не ошибка
}

export type ReportReason = 'face_without_consent' | 'inappropriate' | 'spam' | 'wrong_place_or_time' | 'other';

export async function reportPhoto(photoId: string, userId: string, reason: ReportReason) {
  const { error } = await supabase.from('reports').insert({ photo_id: photoId, reporter_id: userId, reason });
  if (error && error.code !== '23505') throw error; // уже жаловались — ок
}

export async function hideAuthor(userId: string, authorId: string) {
  const { error } = await supabase.from('hidden_authors').insert({ user_id: userId, hidden_user_id: authorId });
  if (error && error.code !== '23505') throw error;
}

/** «Последние моменты» (B1, 12.10): снимки, собранные по месту (~150 м) и 15-минутному интервалу. Ваш последний — первым */
export type RecentMoment = { lat: number; lng: number; bucket: string; photo_count: number; place_name: string | null; cover_path: string; mine: boolean };
export async function fetchRecentMoments(limit = 6): Promise<RecentMoment[]> {
  const [all, mine] = await Promise.all([
    supabase.rpc('recent_moments', { only_mine: false, max_rows: limit + 1 }),
    supabase.rpc('recent_moments', { only_mine: true, max_rows: 1 }),
  ]);
  if (all.error) throw all.error;
  const key = (m: RecentMoment) => `${m.bucket}|${m.lat.toFixed(3)}|${m.lng.toFixed(3)}`;
  const my = ((mine.data ?? []) as RecentMoment[])[0];
  const rest = ((all.data ?? []) as RecentMoment[]).filter((m) => !my || key(m) !== key(my));
  return (my ? [my, ...rest] : rest).slice(0, limit);
}
