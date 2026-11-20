// Массовая загрузка (C2 мультивыбор → C2b проверка → C2c загрузка на карте), 17.11
// Снимки пачки живут в памяти: файл в JPEG готовим только перед загрузкой, чтобы 50 снимков не держать в base64.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImageManipulator from 'expo-image-manipulator';
import type * as ImagePicker from 'expo-image-picker';
import type { Asset } from 'expo-media-library';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { parseExif } from './exif';
import { newPublishKey, uploadPhoto, type FreshAuthor, type PublishKey } from './photos';

/** Сколько снимков можно выбрать за раз (17.11: 50 вместо 20) */
export const BATCH_LIMIT = 50;
/** Сколько снимков грузим одновременно */
const CONCURRENCY = 2;

export type BatchItem = {
  key: string;
  uri: string; // превью
  lat: number | null;
  lng: number | null;
  locationSource: 'exif' | 'device' | 'manual';
  takenAt: Date | null;
  timeSource: 'snapshot' | 'manual';
  place: string | null;
  address: string | null;
  /** key — id снимка в фототеке (по нему ищем дубли) */
  library: boolean;
  /** исходник: файл из системного выбора или снимок фототеки («Недавние») */
  src: { kind: 'file'; uri: string; width: number } | { kind: 'asset'; asset: Asset };
};

// ── Уже загруженные снимки (ревью 17.11: отмечать дубли): ключи снимков фототеки, на телефоне ──
const UPLOADED_KEY = 'dreamapp.uploadedAssets';
let uploaded = new Set<string>();
const uploadedListeners = new Set<() => void>();
// на веб-сервере (SSR) window нет — читаем только на устройстве
if (!(Platform.OS === 'web' && typeof window === 'undefined'))
  AsyncStorage.getItem(UPLOADED_KEY)
  .then((raw) => {
    if (raw) uploaded = new Set(JSON.parse(raw));
    uploadedListeners.forEach((l) => l());
  })
  .catch(() => {});
function markUploaded(key: string) {
  uploaded = new Set(uploaded).add(key);
  AsyncStorage.setItem(UPLOADED_KEY, JSON.stringify([...uploaded].slice(-3000))).catch(() => {});
  uploadedListeners.forEach((l) => l());
}
export const isUploaded = (key: string) => uploaded.has(key);
export function useUploaded() {
  return useSyncExternalStore(
    (l) => {
      uploadedListeners.add(l);
      return () => uploadedListeners.delete(l);
    },
    () => uploaded,
  );
}

/** id снимка фототеки: у выбора фото и у фототеки он может отличаться приставкой ph:// */
export const libKey = (id: string) => id.replace(/^ph:\/\//, '');
/** Превью снимка фототеки для expo-image: на iOS — ph://<id> (его понимает загрузчик фототеки expo-image),
 *  на Android id уже content:// */
export const assetPreviewUri = (id: string) => (Platform.OS === 'ios' && !id.includes('://') ? `ph://${id}` : id);
let seq = 0;
const nextKey = () => `b${Date.now().toString(36)}-${seq++}`;

/** Снимок из системного выбора фото → строка пачки (место и время — из EXIF) */
export function batchFromPicker(a: ImagePicker.ImagePickerAsset): BatchItem {
  const ex = parseExif(a.exif);
  return {
    key: a.assetId ? libKey(a.assetId) : nextKey(),
    library: !!a.assetId,
    uri: a.uri,
    lat: ex.lat,
    lng: ex.lng,
    locationSource: 'exif',
    takenAt: ex.takenAt,
    timeSource: 'snapshot',
    place: null,
    address: null,
    src: { kind: 'file', uri: a.uri, width: a.width },
  };
}

/** Снимок из «Недавних» (место и время — из фототеки) → строка пачки */
export function batchFromAsset(asset: Asset, lat: number | null, lng: number | null, time: number | null): BatchItem {
  return {
    key: libKey(asset.id),
    library: true,
    uri: assetPreviewUri(asset.id),
    lat,
    lng,
    locationSource: 'exif',
    takenAt: time ? new Date(time) : null,
    timeSource: 'snapshot',
    place: null,
    address: null,
    src: { kind: 'asset', asset },
  };
}

/** JPEG ≤ 2048 px для загрузки — как у одиночного снимка в C2 */
export async function prepareJpeg(it: BatchItem) {
  const [src, w] = it.src.kind === 'file' ? [it.src.uri, it.src.width] : [await it.src.asset.getUri(), await it.src.asset.getWidth()];
  const ctx = ImageManipulator.ImageManipulator.manipulate(src);
  if (w > 2048) ctx.resize({ width: 2048, height: null });
  const img = await (await ctx.renderAsync()).saveAsync({ format: ImageManipulator.SaveFormat.JPEG, compress: 0.7, base64: true });
  return { uri: img.uri, base64: img.base64 ?? '', mimeType: 'image/jpeg', width: img.width, height: img.height };
}

// ── Пачка между C2 и C2b ──
let pending: BatchItem[] = [];
export const setBatch = (items: BatchItem[]) => {
  pending = items;
};
// не очищаем: в режиме разработки React вызывает начальное состояние дважды; следующий setBatch перезапишет
export const takeBatch = () => pending;

// ── Загрузка (C2c): идёт в фоне, плашка на карте подписана на состояние ──
export type UploadJob = {
  id: number;
  total: number;
  done: number;
  failed: BatchItem[]; // не загрузились — «Повторить»
  running: boolean;
  first: { lat: number; lng: number; at: Date } | null; // «Смотреть» → сюда, пока ни один не загрузился
  firstDone: { lat: number; lng: number; at: Date } | null; // первый загруженный: карта перелетает к нему сама
  startedAt: number; // когда нажали «Опубликовать»: трогали карту позже — сами не перелетаем
};

let job: UploadJob | null = null;
let jobSeq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (patch: Partial<UploadJob>) => {
  if (!job) return;
  job = { ...job, ...patch };
  emit();
};

type Ctx = { userId: string; priv: boolean; author: FreshAuthor | null };
type Task = { it: BatchItem; ctx: Ctx };
let queue: Task[] = [];
let active = 0;
const ctxOf = new Map<string, Ctx>(); // для «Повторить»: снимок грузится с той видимостью, с какой его отправили
const keys = new Map<string, PublishKey>(); // один момент на все «Повторить» — без дублей

async function uploadOne({ it, ctx }: Task) {
  if (it.lat == null || it.lng == null || !it.takenAt) throw new Error('no place or time');
  const f = await prepareJpeg(it);
  let k = keys.get(it.key);
  if (!k) keys.set(it.key, (k = newPublishKey(ctx.userId, f.mimeType, ctx.priv)));
  await uploadPhoto(
    ctx.userId,
    {
      base64: f.base64,
      mimeType: f.mimeType,
      width: f.width,
      height: f.height,
      takenAt: it.takenAt,
      lat: it.lat,
      lng: it.lng,
      locationSource: it.locationSource,
      placeName: it.place,
      caption: null,
      private: ctx.priv,
    },
    k,
    // карта показывает каждый снимок сразу после insert, превью — из локального JPEG (QA 17.11)
    { localUri: f.uri, author: ctx.author },
  );
}

function pump() {
  while (job && active < CONCURRENCY && queue.length) {
    const task = queue.shift()!;
    const it = task.it;
    const id = job.id;
    active++;
    set({ running: true });
    uploadOne(task)
      .then(() => {
        keys.delete(it.key);
        ctxOf.delete(it.key);
        if (it.library) markUploaded(it.key);
        if (job?.id === id)
          set({ done: job.done + 1, firstDone: job.firstDone ?? { lat: it.lat!, lng: it.lng!, at: it.takenAt! } });
      })
      .catch(() => {
        // ошибка одного снимка не останавливает остальные (заметка C2c)
        if (job?.id === id) set({ failed: [...job.failed, it] });
      })
      .finally(() => {
        active--;
        if (job?.id === id && !queue.length && !active) set({ running: false });
        pump();
      });
  }
}

/** «Опубликовать N»: грузим по 2 снимка, по порядку.
 *  Если прошлая пачка ещё грузится — новые снимки встают в ту же очередь (QA 17.11: раньше очередь перезаписывалась). */
export function startUpload(userId: string, items: BatchItem[], priv: boolean, author: FreshAuthor | null = null) {
  const ctx: Ctx = { userId, priv, author };
  if (job?.running) {
    const fresh = items.filter((i) => !ctxOf.has(i.key)); // уже в этой загрузке — второй раз не ставим
    fresh.forEach((i) => ctxOf.set(i.key, ctx));
    const tasks = fresh.map((it) => ({ it, ctx }));
    queue.push(...tasks);
    set({ total: job.total + tasks.length });
    pump();
    return;
  }
  const fresh = items;
  queue = fresh.map((it) => ({ it, ctx }));
  keys.clear();
  ctxOf.clear();
  fresh.forEach((i) => ctxOf.set(i.key, ctx));
  const f = fresh.find((i) => i.lat != null && i.lng != null && i.takenAt);
  job = {
    id: ++jobSeq,
    total: fresh.length,
    done: 0,
    failed: [],
    running: fresh.length > 0,
    first: f ? { lat: f.lat!, lng: f.lng!, at: f.takenAt! } : null,
    firstDone: null,
    startedAt: Date.now(),
  };
  emit();
  pump();
}

/** «Повторить»: один снимок или все незагруженные */
export function retryUpload(key?: string) {
  if (!job) return;
  const again = job.failed.filter((i) => (!key || i.key === key) && ctxOf.has(i.key));
  if (!again.length) return;
  set({ failed: job.failed.filter((i) => !again.includes(i)), running: true });
  for (const it of again) queue.push({ it, ctx: ctxOf.get(it.key)! });
  pump();
}

/** Тост смахнули / скрылся сам */
export function dismissUpload() {
  if (job?.running) return;
  job = null;
  queue = [];
  emit();
}

export const getUploadJob = () => job;
export function useUploadJob() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => job,
  );
}

// ── Дни поездки (C2 v3 и C2b v3, 17.11): «Сб, 2 авг · Петергоф» ──
const WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MON = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
export const dayKey = (d: Date | null) => (d ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : 'none');
/** «Сб, 2 авг», для прошлых лет — «Сб, 2 авг 2024» */
export const dayTitle = (d: Date | null) =>
  d ? `${WD[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]}${d.getFullYear() === new Date().getFullYear() ? '' : ` ${d.getFullYear()}`}` : 'Без даты';
export const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
export const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
};

/** Группы по дню съёмки в исходном порядке списка */
export function groupByDay<T>(list: T[], time: (t: T) => Date | null) {
  const out: { key: string; date: Date | null; items: T[] }[] = [];
  const at = new Map<string, number>();
  for (const it of list) {
    const d = time(it);
    const k = dayKey(d);
    let i = at.get(k);
    if (i == null) {
      at.set(k, (i = out.length));
      out.push({ key: k, date: d, items: [] });
    }
    out[i].items.push(it);
  }
  return out;
}
