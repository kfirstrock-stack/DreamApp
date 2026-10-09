// B4 · поиск места: места из базы (по подписям снимков) + геокодер Photon (OpenStreetMap)
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

export type Place = { key: string; name: string; city: string | null; lat: number; lng: number; count: number | null };
export type Recent = { name: string; lat: number; lng: number; at: number };
export type Popular = { name: string; lat: number; lng: number; count: number; cover: string; takenAt: string };

const norm = (s: string) => s.trim().toLowerCase().replace(/ё/g, 'е');

/** «1 284» — тысячи через неразрывный пробел */
export const thousands = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

// Город для мест из базы: подписи снимков хранят только название места
const cityCache = new Map<string, string | null>();
async function cityOf(lat: number, lng: number) {
  const k = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  if (cityCache.has(k)) return cityCache.get(k)!;
  let city: string | null = null;
  try {
    // обратный геокодер Photon: без разрешения на геопозицию
    const res = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&limit=1`, { headers: { Accept: 'application/json' } });
    const p = (await res.json())?.features?.[0]?.properties;
    city = p?.city ?? p?.county ?? p?.state ?? null;
  } catch {}
  cityCache.set(k, city);
  return city;
}

async function photonSearch(q: string, near: { lat: number; lng: number }, signal: AbortSignal): Promise<Place[]> {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lat=${near.lat}&lon=${near.lng}&limit=8`;
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) return [];
  const json = await res.json();
  const out: Place[] = [];
  for (const f of json?.features ?? []) {
    const p = f.properties ?? {};
    const [lng, lat] = f.geometry?.coordinates ?? [];
    if (!p.name || typeof lat !== 'number') continue;
    const city = p.city ?? (p.osm_value === 'city' ? p.state : p.county) ?? p.state ?? null;
    out.push({ key: `osm:${p.osm_type}${p.osm_id}`, name: p.name, city: city === p.name ? p.country ?? null : city, lat, lng, count: null });
  }
  return out;
}

/** Места по запросу: сначала из базы (там, где снимали), затем из геокодера; у каждого — сколько здесь фото */
export async function searchPlaces(q: string, near: { lat: number; lng: number }, signal: AbortSignal): Promise<Place[]> {
  const [db, osm] = await Promise.all([
    supabase
      .rpc('search_places', { q, near_lat: near.lat, near_lng: near.lng, max_rows: 5 })
      .then(({ data }) =>
        ((data ?? []) as { place_name: string; lat: number; lng: number; photo_count: number }[]).map((r) => ({
          key: `db:${r.place_name}`,
          name: r.place_name,
          city: null as string | null,
          lat: r.lat,
          lng: r.lng,
          count: Number(r.photo_count),
        })),
      ),
    photonSearch(q, near, signal).catch(() => [] as Place[]),
  ]);
  const seen = new Set(db.map((p) => norm(p.name)));
  const list: Place[] = [...db];
  for (const p of osm) {
    const k = `${norm(p.name)}|${norm(p.city ?? '')}`;
    if (seen.has(norm(p.name)) || seen.has(k)) continue;
    seen.add(k);
    list.push(p);
    if (list.length >= 6) break;
  }
  await Promise.all(
    list.map(async (p) => {
      if (p.city == null) p.city = await cityOf(p.lat, p.lng);
      if (p.count == null) {
        const { data } = await supabase.rpc('photo_count_near', { lat: p.lat, lng: p.lng, radius_m: 150 });
        p.count = Number(data ?? 0);
      }
    }),
  );
  return list;
}

/** «Популярно сегодня»: места вокруг карты (~30 км), где сегодня больше всего снимали */
export async function popularToday(near: { lat: number; lng: number }): Promise<Popular[]> {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const { data, error } = await supabase.rpc('popular_places', {
    near_lat: near.lat,
    near_lng: near.lng,
    radius_m: 30000,
    from_ts: from.toISOString(),
    to_ts: now.toISOString(),
    max_rows: 6,
  });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    name: r.place_name,
    lat: r.lat,
    lng: r.lng,
    count: Number(r.photo_count),
    cover: r.cover_path,
    takenAt: r.cover_taken_at,
  }));
}

// Недавние — хранятся на телефоне
const RECENT_KEY = 'dreamapp.search.recent';
export async function loadRecent(): Promise<Recent[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(RECENT_KEY)) ?? '[]');
  } catch {
    return [];
  }
}
export async function saveRecent(r: Omit<Recent, 'at'>) {
  const list = (await loadRecent()).filter((x) => norm(x.name) !== norm(r.name));
  list.unshift({ ...r, at: Date.now() });
  await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 5))).catch(() => {});
}

/** «сегодня» · «вчера» · «3 дня назад» */
export function agoDays(at: number) {
  const d0 = new Date();
  const today = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate()).getTime();
  const d = new Date(at);
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const n = Math.round((today - day) / 86400000);
  if (n <= 0) return 'сегодня';
  if (n === 1) return 'вчера';
  const m10 = n % 10, m100 = n % 100;
  const w = m10 === 1 && m100 !== 11 ? 'день' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'дня' : 'дней';
  return `${n} ${w} назад`;
}
