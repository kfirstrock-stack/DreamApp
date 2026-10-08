import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';
import { STEP_INTERVAL, type Granularity } from './time';
import type { Bounds, Photo, TimeWindow } from './types';

// Кэш, чтобы экран фото открывался мгновенно после карты
const cache = new Map<string, Photo>();
export const cachePhotos = (list: Photo[]) => list.forEach((p) => cache.set(p.id, p));
export const cachedPhoto = (id: string) => cache.get(id);

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
  'id,user_id,storage_path,width,height,taken_at,lat,lng,place_name,caption,profiles(username,display_name,avatar_url)';

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
};

export async function uploadPhoto(userId: string, p: NewPhoto): Promise<string> {
  const ext = p.mimeType.includes('png') ? 'png' : p.mimeType.includes('heic') ? 'heic' : 'jpg';
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const up = await supabase.storage.from('photos').upload(path, decode(p.base64), {
    contentType: p.mimeType,
    upsert: false,
  });
  if (up.error) throw up.error;

  const { data, error } = await supabase
    .from('photos')
    .insert({
      user_id: userId,
      storage_path: path,
      width: p.width,
      height: p.height,
      taken_at: p.takenAt.toISOString(),
      lat: p.lat,
      lng: p.lng,
      location_source: p.locationSource,
      place_name: p.placeName,
      caption: p.caption,
    })
    .select('id')
    .single();
  if (error) {
    await supabase.storage.from('photos').remove([path]);
    throw error;
  }
  return data.id as string;
}

export async function deletePhoto(p: Photo) {
  const { error } = await supabase.from('photos').delete().eq('id', p.id);
  if (error) throw error;
  if (!p.storage_path.startsWith('http')) await supabase.storage.from('photos').remove([p.storage_path]);
  cache.delete(p.id);
}
