// Черновик нового момента: снимок выбран в C2, дальше C3 → C4/C5 → публикация → C6
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
