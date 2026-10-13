// «С возвращением» (A4, утверждено 11.10): помним, кто входил на этом телефоне, чтобы после выхода
// войти снова одной кнопкой. Только почта, имя и аватар — без токенов. «Другая почта» — забываем.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'dreamapp.lastUser';
/** Снимок для полароида «С возвращением» (13.10): последние кадры этого человека */
export type LastShot = { path: string; taken_at: string; place: string | null };
export type LastUser = { email: string; name: string; avatar: string | null; shots?: LastShot[] };

export async function loadLastUser(): Promise<LastUser | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const u = raw ? (JSON.parse(raw) as LastUser) : null;
    return u?.email ? u : null;
  } catch {
    return null;
  }
}

export async function saveLastUser(u: LastUser) {
  await AsyncStorage.setItem(KEY, JSON.stringify(u)).catch(() => {});
}

export async function forgetLastUser() {
  await AsyncStorage.removeItem(KEY).catch(() => {});
}
