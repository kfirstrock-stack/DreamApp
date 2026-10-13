// Лента (утверждено 13.10): «Сетка / Лента» на B5, D3 и «Моих моментах»; тап по снимку — кадр во весь экран,
// свайп вверх/вниз — соседние кадры того же списка. Список передаём экрану снимка в памяти, по ключу.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { cachePhotos } from './photos';
import type { Photo } from './types';

const lists = new Map<string, Photo[]>();
let seq = 0;

/** Открыть кадр во весь экран; list — соседние кадры для листания (порядок как на экране) */
export function openPhotoFeed(id: string, list?: Photo[]) {
  if (list?.length) {
    cachePhotos(list);
    const key = String(++seq);
    lists.set(key, list);
    if (lists.size > 20) lists.delete(lists.keys().next().value as string); // старые списки не держим
    router.push({ pathname: '/photo/[id]', params: { id, ctx: key } });
  } else {
    router.push({ pathname: '/photo/[id]', params: { id } });
  }
}
export const feedList = (key?: string) => (key ? lists.get(key) : undefined);

// Режим «Сетка / Лента» — один на всё приложение, запоминается
export type ViewMode = 'grid' | 'cards';
const KEY = 'dreamapp.viewMode';
let mode: ViewMode = 'grid';
let loaded = false;
const subs = new Set<(m: ViewMode) => void>();

export function useViewMode(): [ViewMode, (m: ViewMode) => void] {
  const [m, setM] = useState<ViewMode>(mode);
  useEffect(() => {
    subs.add(setM);
    if (!loaded) {
      loaded = true;
      AsyncStorage.getItem(KEY)
        .then((v) => {
          if (v === 'grid' || v === 'cards') {
            mode = v;
            subs.forEach((f) => f(v));
          }
        })
        .catch(() => {});
    }
    return () => {
      subs.delete(setM);
    };
  }, []);
  const set = (v: ViewMode) => {
    mode = v;
    subs.forEach((f) => f(v));
    AsyncStorage.setItem(KEY, v).catch(() => {});
  };
  return [m, set];
}

/** «2 года назад», «вчера» — как на B6 */
export const ago = (d: Date) => {
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days < 1) return 'сегодня';
  if (days < 2) return 'вчера';
  if (days < 30) return `${days} дн. назад`;
  const y = Math.floor(days / 365);
  if (y >= 1) return y === 1 ? 'год назад' : y < 5 ? `${y} года назад` : `${y} лет назад`;
  return `${Math.floor(days / 30)} мес. назад`;
};
