import { router, useGlobalSearchParams, usePathname, type Href } from 'expo-router';
import { useCallback, useSyncExternalStore } from 'react';

// Просьба к карте «перелети сюда» — например, из экрана фото: «Кто ещё был здесь в это время»
export type FocusRequest = { lat: number; lng: number; at?: Date };

let pending: FocusRequest | null = null;
// Откуда открыли карту по ссылке «на карте»: чтобы вернуться в ленту или к снимку
let origin: string | null = null;
const originSubs = new Set<() => void>();
const emitOrigin = () => originSubs.forEach((fn) => fn());

export const requestMapFocus = (f: FocusRequest) => {
  pending = f;
};

export const consumeMapFocus = (): FocusRequest | null => {
  const f = pending;
  pending = null;
  return f;
};

export const getMapOrigin = () => origin;
export const subscribeMapOrigin = (fn: () => void) => {
  originSubs.add(fn);
  return () => {
    originSubs.delete(fn);
  };
};
export const clearMapOrigin = () => {
  if (origin == null) return;
  origin = null;
  emitOrigin();
};

export const useMapOrigin = () => useSyncExternalStore(subscribeMapOrigin, getMapOrigin, getMapOrigin);

/** href текущего экрана (путь + query, без параметров, которые уже есть в пути) */
export function originHref(pathname: string, params: Record<string, string | string[] | undefined>) {
  const inPath = new Set(pathname.split('/').filter(Boolean));
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || k.startsWith('__')) continue;
    const vals = Array.isArray(v) ? v : [v];
    for (const one of vals) {
      if (inPath.has(String(one))) continue;
      q.append(k, String(one));
    }
  }
  const qs = q.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export const hasPlace = (p: { lat: number | null; lng: number | null }) => Number.isFinite(p.lat) && Number.isFinite(p.lng);

/** «На карте»: перелететь к снимку — его место и время (как «Смотреть» у пачки). from — куда вернуть «Назад» */
export function showPhotoOnMap(p: { lat: number; lng: number; taken_at: string }, from?: string | null) {
  if (!hasPlace(p)) return;
  requestMapFocus({ lat: p.lat, lng: p.lng, at: new Date(p.taken_at) });
  origin = from ?? null;
  emitOrigin();
  // Карта уже в корне стека: второй экземпляр MapView тяжелее и сбрасывает стартовый перелёт.
  // Запоминаем origin и возвращаемся на существующую карту; «Назад» откроет исходный экран поверх.
  router.dismissTo('/');
}

/** С карты обратно туда, откуда пришли по ссылке «на карте» */
export function returnToMapOrigin() {
  const href = origin;
  clearMapOrigin();
  if (!href) return;
  if (router.canGoBack()) router.back();
  else router.navigate(href as Href);
}

export function useShowPhotoOnMap() {
  const pathname = usePathname();
  const params = useGlobalSearchParams<Record<string, string | string[] | undefined>>();
  const from = originHref(pathname, params);
  return useCallback((p: { lat: number; lng: number; taken_at: string }) => showPhotoOnMap(p, from), [from]);
}
