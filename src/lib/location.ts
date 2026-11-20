// Где сейчас телефон — без зависаний (QA 17.11): iPad без GPS / выключенные службы геолокации
// могут не отвечать на getCurrentPositionAsync вовсе. Сначала последнее известное место, затем текущее с таймаутом.
import * as Location from 'expo-location';

const TIMEOUT_MS = 8000;

/** null — место узнать не удалось (нет доступа, нет сигнала, истёк таймаут). Разрешение не запрашивает. */
export async function currentPosition(maxAgeMs = 10 * 60 * 1000): Promise<Location.LocationObject | null> {
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
