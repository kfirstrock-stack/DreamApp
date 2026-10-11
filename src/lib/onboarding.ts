// Первый запуск (A1–A3 показываем один раз) и «куда вернуться после входа»
import AsyncStorage from '@react-native-async-storage/async-storage';
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
