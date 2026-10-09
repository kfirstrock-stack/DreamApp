// Первый запуск (A1–A3 показываем один раз) и «куда вернуться после входа»
import AsyncStorage from '@react-native-async-storage/async-storage';

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
