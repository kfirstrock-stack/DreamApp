// Черновик нового момента: снимок выбран в C2, дальше C3 → C4/C5 → публикация → C6
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { parseExif } from './exif';

export type Draft = {
  uri: string; // для показа
  base64: string; // JPEG для загрузки
  mimeType: string;
  width: number;
  height: number;
  lat: number | null;
  lng: number | null;
  locationSource: 'exif' | 'device' | 'manual';
  takenAt: Date | null; // null — в снимке нет времени (C5)
  timeSource: 'snapshot' | 'manual';
};

let current: Draft | null = null;
export const setDraft = (d: Draft | null) => {
  current = d;
};
export const getDraft = () => current;

/** Снимок из системного выбора фото или камеры → черновик */
export function draftFromPicker(asset: ImagePicker.ImagePickerAsset, camera: boolean): Draft {
  const ex = parseExif(asset.exif);
  return {
    uri: asset.uri,
    base64: asset.base64 ?? '',
    mimeType: asset.mimeType ?? 'image/jpeg',
    width: asset.width,
    height: asset.height,
    lat: ex.lat,
    lng: ex.lng,
    locationSource: 'exif',
    takenAt: ex.takenAt ?? (camera ? new Date() : null),
    timeSource: 'snapshot',
  };
}

// ── Сохранённый черновик (E2 «Сохранить черновик», утверждено 12.10): один, на телефоне, до публикации ──

export type DraftExtras = { place: string | null; address: string | null; caption: string };
const KEY = 'dreamapp.savedDraft';

// что ввели на C3 — чтобы «Продолжить черновик» открыл экран как был
let extras: DraftExtras | null = null;
export const setDraftExtras = (e: DraftExtras | null) => {
  extras = e;
};
export const takeDraftExtras = () => {
  const e = extras;
  extras = null;
  return e;
};

export async function saveDraft(d: Draft, e: DraftExtras) {
  const { uri: _uri, ...rest } = d; // временный файл снимка может пропасть — показываем из base64
  await AsyncStorage.setItem(KEY, JSON.stringify({ ...rest, takenAt: d.takenAt?.toISOString() ?? null, extras: e, savedAt: Date.now() }));
}

export async function loadSavedDraft(): Promise<{ draft: Draft; extras: DraftExtras } | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s?.base64) return null;
    const draft: Draft = { ...s, uri: `data:${s.mimeType ?? 'image/jpeg'};base64,${s.base64}`, takenAt: s.takenAt ? new Date(s.takenAt) : null };
    return { draft, extras: s.extras ?? { place: null, address: null, caption: '' } };
  } catch {
    return null;
  }
}

export const clearSavedDraft = () => AsyncStorage.removeItem(KEY).catch(() => {});
