// Первый запуск (A1–A3 показываем один раз) и «куда вернуться после входа»
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

const KEY = 'dreamapp.onboarded';

export async function isOnboarded() {
  try {
    return (await AsyncStorage.getItem(KEY)) === '1';
  } catch {
    return true; // хранилище недоступно — не мучаем онбордингом
  }
}

export async function markOnboarded() {
  await AsyncStorage.setItem(KEY, '1').catch(() => {});
}

// Заставку прячем, только когда ясно, что показывать первым: карту или онбординг.
// Иначе карта на мгновение проскакивает до A1.
let splashHidden = false;
export function hideSplash(delay = 0) {
  if (splashHidden) return;
  splashHidden = true;
  setTimeout(() => SplashScreen.hideAsync().catch(() => {}), delay);
}

// Только для проверки в разработке: снова показать онбординг
export async function resetOnboarded() {
  await AsyncStorage.removeItem(KEY).catch(() => {});
}

// Вход после онбординга открывается поверх A3 (без чёрного кадра между модалками),
// поэтому выходить из него надо сразу на карту, а из C1 — просто назад к шторке публикации.
let fromWelcome = false;
export function setAuthFromWelcome(v: boolean) {
  fromWelcome = v;
}
export function leaveAuth() {
  if (fromWelcome) {
    fromWelcome = false;
    router.dismissTo('/');
  } else router.back();
}
