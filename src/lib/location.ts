// Где сейчас телефон — без зависаний (QA 17.11): iPad без GPS / выключенные службы геолокации
// могут не отвечать на getCurrentPositionAsync вовсе. Сначала последнее известное место, затем текущее с таймаутом.
// На вебе expo-location часто молчит — берём navigator.geolocation и ясно сообщаем, если отказали или нет поддержки.
import * as Location from 'expo-location';
import { Platform } from 'react-native';

const TIMEOUT_MS = 8000;

export type LocateFail = 'unsupported' | 'denied' | 'failed';
export type LocateResult = { ok: true; coords: { latitude: number; longitude: number } } | { ok: false; reason: LocateFail };

export function locateAlert(reason: LocateFail): { title: string; message: string } {
  if (reason === 'unsupported') {
    return { title: 'Геопозиция недоступна', message: 'Браузер не умеет определять место. Откройте Glimika в Expo Go на телефоне.' };
  }
  if (reason === 'denied') {
    return {
      title: 'Нет доступа к геопозиции',
      message: Platform.OS === 'web' ? 'Разрешите его в настройках браузера.' : 'Разрешите его в настройках телефона.',
    };
  }
  return {
    title: 'Не удалось определить место',
    message: Platform.OS === 'web' ? 'Проверьте доступ к геопозиции и попробуйте ещё раз.' : 'Проверьте, что службы геолокации включены, или передвиньте карту вручную.',
  };
}

function webPosition(): Promise<LocateResult> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve({ ok: false, reason: 'unsupported' });
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ ok: true, coords: { latitude: pos.coords.latitude, longitude: pos.coords.longitude } }),
      (err) => resolve({ ok: false, reason: err.code === 1 ? 'denied' : 'failed' }),
      { enableHighAccuracy: false, timeout: TIMEOUT_MS, maximumAge: 10 * 60 * 1000 },
    );
  });
}

/** Запрашивает разрешение (на вебе — системный диалог браузера) и возвращает координаты или причину отказа. */
export async function requestCurrentPosition(): Promise<LocateResult> {
  if (Platform.OS === 'web') return webPosition();
  const perm = await Location.requestForegroundPermissionsAsync().catch(() => null);
  if (!perm?.granted) return { ok: false, reason: 'denied' };
  const pos = await currentPosition();
  if (pos) return { ok: true, coords: { latitude: pos.coords.latitude, longitude: pos.coords.longitude } };
  return { ok: false, reason: 'failed' };
}

/** null — место узнать не удалось (нет доступа, нет сигнала, истёк таймаут). Разрешение не запрашивает, кроме веба. */
export async function currentPosition(maxAgeMs = 10 * 60 * 1000): Promise<Location.LocationObject | null> {
  if (Platform.OS === 'web') {
    const res = await webPosition();
    if (!res.ok) return null;
    return {
      coords: {
        latitude: res.coords.latitude,
        longitude: res.coords.longitude,
        altitude: null,
        accuracy: 0,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: Date.now(),
    };
  }
  try {
    const last = await Location.getLastKnownPositionAsync({ maxAge: maxAgeMs });
    if (last) return last;
  } catch {}
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const current = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    current.catch(() => {}); // ответ с ошибкой после таймаута — не необработанный reject
    return await Promise.race([
      current,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), TIMEOUT_MS);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
