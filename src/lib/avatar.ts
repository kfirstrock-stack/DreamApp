// Фото профиля: выбрать/снять и загрузить в хранилище (A6, D4)
import { decode } from 'base64-arraybuffer';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Linking } from 'react-native';
import { supabase } from './supabase';

export async function pickAvatarImage(src: 'camera' | 'gallery'): Promise<{ uri: string; base64: string } | null> {
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 };
  let res: ImagePicker.ImagePickerResult;
  if (src === 'camera') {
    // доступ к камере спрашиваем только сейчас — при первой съёмке (как обещает A7)
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Нет доступа к камере', 'Разрешите DreamApp пользоваться камерой в настройках — или выберите фото из галереи.', [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Открыть настройки', onPress: () => Linking.openSettings() },
      ]);
      return null;
    }
    // Без системного кадрирования: iOS показывает селфи зеркально, а кадрирует уже «настоящий» снимок —
    // лицо при этом переворачивается. Отражаем снимок как в видоискателе и сами берём квадрат по центру.
    res = await ImagePicker.launchCameraAsync({ ...opts, allowsEditing: false, cameraType: ImagePicker.CameraType.front });
  } else {
    res = await ImagePicker.launchImageLibraryAsync(opts);
  }
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  const ctx = ImageManipulator.ImageManipulator.manipulate(a.uri);
  if (src === 'camera') {
    ctx.flip(ImageManipulator.FlipType.Horizontal);
    const side = Math.min(a.width, a.height);
    if (side > 0) ctx.crop({ originX: (a.width - side) / 2, originY: (a.height - side) / 2, width: side, height: side });
  }
  ctx.resize({ width: 400, height: null });
  const img = await (await ctx.renderAsync()).saveAsync({ format: ImageManipulator.SaveFormat.JPEG, compress: 0.8, base64: true });
  return { uri: img.uri, base64: img.base64 ?? '' };
}

/** Загружает аватар в свою папку и возвращает публичную ссылку */
export async function uploadAvatar(uid: string, base64: string) {
  const path = `${uid}/avatar-${Date.now()}.jpg`;
  // без upsert: имя и так уникальное, а upsert требует ещё прав SELECT/UPDATE в хранилище (из-за этого падало)
  const up = await supabase.storage.from('photos').upload(path, decode(base64), { contentType: 'image/jpeg' });
  if (up.error) throw up.error;
  return supabase.storage.from('photos').getPublicUrl(path).data.publicUrl;
}

export type NickState = 'empty' | 'invalid' | 'checking' | 'free' | 'taken';
export const NICK_RE = /^[a-z0-9_.]{3,30}$/;

export const nickHint = (s: NickState) =>
  s === 'free'
    ? 'Ник свободен. Так вас найдут другие — его можно поменять позже.'
    : s === 'taken'
      ? 'Этот ник уже занят — попробуйте другой.'
      : s === 'invalid'
        ? 'Латиница, цифры, точка и _ — от 3 до 30 символов.'
        : s === 'checking'
          ? 'Проверяем…'
          : '';
