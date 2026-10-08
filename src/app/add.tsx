import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MapView, { type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CircleButton } from '@/components/CircleButton';
import { Icon } from '@/components/Icon';
import { useAuth } from '@/lib/auth';
import { parseExif } from '@/lib/exif';
import { requestMapFocus } from '@/lib/focus';
import { uploadPhoto } from '@/lib/photos';
import { colors, radius, shadow } from '@/lib/theme';
import { dateTime } from '@/lib/time';

type Picked = {
  asset: ImagePicker.ImagePickerAsset;
  lat: number | null;
  lng: number | null;
  locationSource: 'exif' | 'device' | 'manual';
  takenAt: Date;
  timeKnown: boolean;
};

const MIN = 60_000;
const SHIFTS = [
  { label: '−1 д', ms: -1440 * MIN },
  { label: '−1 ч', ms: -60 * MIN },
  { label: '−15 м', ms: -15 * MIN },
  { label: '+15 м', ms: 15 * MIN },
  { label: '+1 ч', ms: 60 * MIN },
  { label: '+1 д', ms: 1440 * MIN },
];

async function currentPosition() {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (!perm.granted) return null;
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}

async function placeNameFor(lat: number, lng: number): Promise<string | null> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted) return null;
    const [a] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    if (!a) return null;
    const parts = [a.name && a.name !== a.streetNumber ? a.name : a.street, a.city, a.country].filter(Boolean);
    return [...new Set(parts)].join(', ').slice(0, 120) || null;
  } catch {
    return null;
  }
}

// Добавление фото: камера или галерея → место и время → подпись → публикация
export default function AddPhotoScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [placeName, setPlaceName] = useState('');
  const [caption, setCaption] = useState('');
  const [choosingPlace, setChoosingPlace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const pickerRegion = useRef<Region | null>(null);

  // Название места подтягиваем автоматически, когда известны координаты
  useEffect(() => {
    if (picked?.lat == null || picked?.lng == null) return;
    placeNameFor(picked.lat, picked.lng).then((n) => n && setPlaceName((cur) => cur || n));
  }, [picked?.lat, picked?.lng]);

  const pick = async (src: 'camera' | 'gallery') => {
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], exif: true, base64: true, quality: 0.7 };
    if (src === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return Alert.alert('Нужен доступ к камере', 'Разрешите его в настройках телефона.');
    }
    const res = src === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    setBusy(true);
    try {
      const ex = parseExif(asset.exif);
      let { lat, lng } = ex;
      let locationSource: Picked['locationSource'] = 'exif';
      let takenAt = ex.takenAt;
      if (src === 'camera') {
        takenAt = takenAt ?? new Date();
        if (lat == null || lng == null) {
          const pos = await currentPosition().catch(() => null);
          if (pos) [lat, lng, locationSource] = [pos.lat, pos.lng, 'device'];
        }
      }
      setPlaceName('');
      setPicked({ asset, lat, lng, locationSource, takenAt: takenAt ?? new Date(), timeKnown: !!takenAt });
      if (lat == null) setChoosingPlace(true);
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!picked || !session) return;
    if (picked.lat == null || picked.lng == null) return setChoosingPlace(true);
    if (!picked.asset.base64) return Alert.alert('Не удалось прочитать фото', 'Попробуйте выбрать его ещё раз.');
    setUploading(true);
    try {
      await uploadPhoto(session.user.id, {
        base64: picked.asset.base64,
        mimeType: picked.asset.mimeType ?? 'image/jpeg',
        width: picked.asset.width,
        height: picked.asset.height,
        takenAt: picked.takenAt,
        lat: picked.lat,
        lng: picked.lng,
        locationSource: picked.locationSource,
        placeName: placeName.trim() || null,
        caption: caption.trim() || null,
      });
      // Сразу показываем, кто ещё был в этом месте в это время
      requestMapFocus({ lat: picked.lat, lng: picked.lng, at: picked.takenAt });
      router.dismissTo('/');
    } catch (e: any) {
      Alert.alert('Не получилось опубликовать', e?.message ?? 'Проверьте интернет и попробуйте ещё раз.');
    } finally {
      setUploading(false);
    }
  };

  // Шаг 1: выбор источника (макет «Сделать фото или создать историю»)
  if (!picked) {
    return (
      <View style={[styles.dark, { paddingTop: insets.top + 8 }]}>
        <View style={styles.closeRow}>
          <CircleButton icon="close" size={42} variant="ghost" onPress={() => router.back()} accessibilityLabel="Закрыть" />
        </View>
        {busy ? (
          <ActivityIndicator color={colors.white} style={{ marginTop: 200 }} />
        ) : (
          <View style={styles.sources}>
            <SourceButton icon="camera" label="Сделать фото" onPress={() => pick('camera')} />
            <SourceButton icon="gallery" label="Из галереи" onPress={() => pick('gallery')} />
            <Text style={styles.hint}>
              Место и время возьмём из снимка. Если их там нет — отметите на карте.
            </Text>
          </View>
        )}
      </View>
    );
  }

  // Выбор места на карте: двигаем карту под булавкой
  if (choosingPlace) {
    const initial: Region = {
      latitude: picked.lat ?? 48.8584,
      longitude: picked.lng ?? 2.2945,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    };
    return (
      <View style={{ flex: 1 }}>
        <MapView
          style={StyleSheet.absoluteFill}
          initialRegion={initial}
          onRegionChangeComplete={(r) => (pickerRegion.current = r)}
          showsUserLocation
        />
        <View style={styles.pinWrap} pointerEvents="none">
          <Icon name="pin" size={44} color={colors.red} />
        </View>
        <View style={[styles.pickerTop, { top: insets.top + 8 }]}>
          <View style={styles.pickerHint}>
            <Text style={styles.pickerHintText}>Передвиньте карту, чтобы булавка встала туда, где сделан снимок</Text>
          </View>
        </View>
        <View style={[styles.pickerBottom, { paddingBottom: insets.bottom + 16 }]}>
          <Pressable style={[styles.btn, styles.btnGhost]} onPress={() => setChoosingPlace(false)}>
            <Text style={[styles.btnText, { color: colors.text }]}>Назад</Text>
          </Pressable>
          <Pressable
            style={[styles.btn, { flex: 1 }]}
            onPress={() => {
              const r = pickerRegion.current ?? initial;
              setPicked({ ...picked, lat: r.latitude, lng: r.longitude, locationSource: 'manual' });
              setPlaceName('');
              setChoosingPlace(false);
            }}
          >
            <Text style={styles.btnText}>Снимок сделан здесь</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Шаг 2: проверка места и времени, подпись
  const ratio = picked.asset.height / picked.asset.width || 1;
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        <View style={styles.formHeader}>
          <CircleButton icon="back" size={42} onPress={() => setPicked(null)} accessibilityLabel="Выбрать другое фото" />
          <Text style={styles.formTitle}>Новое фото</Text>
        </View>

        <Image source={{ uri: picked.asset.uri }} style={[styles.preview, { aspectRatio: 1 / Math.min(Math.max(ratio, 0.6), 1.4) }]} contentFit="cover" />

        <View style={styles.card}>
          <Text style={styles.label}>Когда</Text>
          <Text style={styles.value}>{dateTime(picked.takenAt)}</Text>
          {!picked.timeKnown && <Text style={styles.warn}>В снимке нет времени съёмки — поправьте вручную.</Text>}
          <View style={styles.shifts}>
            {SHIFTS.map((s) => (
              <Pressable
                key={s.label}
                style={styles.shift}
                onPress={() => {
                  const t = new Date(picked.takenAt.getTime() + s.ms);
                  if (t.getTime() <= Date.now()) setPicked({ ...picked, takenAt: t, timeKnown: true });
                }}
              >
                <Text style={styles.shiftText}>{s.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Где</Text>
          {picked.lat != null ? (
            <Text style={styles.value}>
              {placeName || `${picked.lat.toFixed(5)}, ${picked.lng?.toFixed(5)}`}
            </Text>
          ) : (
            <Text style={styles.warn}>Место не найдено в снимке.</Text>
          )}
          <Text style={styles.small}>
            {picked.locationSource === 'exif' ? 'Из данных снимка' : picked.locationSource === 'device' ? 'По геопозиции телефона' : 'Отмечено вручную'}
          </Text>
          <Pressable onPress={() => setChoosingPlace(true)} style={styles.linkBtn}>
            <Text style={styles.link}>{picked.lat != null ? 'Уточнить на карте' : 'Отметить на карте'}</Text>
          </Pressable>
          <TextInput
            value={placeName}
            onChangeText={setPlaceName}
            placeholder="Название места (необязательно)"
            placeholderTextColor={colors.muted}
            style={styles.input}
            maxLength={120}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Подпись</Text>
          <TextInput
            value={caption}
            onChangeText={setCaption}
            placeholder="Что здесь происходит?"
            placeholderTextColor={colors.muted}
            style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]}
            multiline
            maxLength={500}
          />
        </View>

        <Pressable style={[styles.btn, styles.publish, (uploading || picked.lat == null) && { opacity: 0.6 }]} onPress={publish} disabled={uploading}>
          {uploading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.btnText}>Опубликовать</Text>}
        </Pressable>
        <Text style={[styles.small, { textAlign: 'center', marginHorizontal: 24 }]}>
          Фото увидят все, кто откроет это место и время на карте.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SourceButton({ icon, label, onPress }: { icon: 'camera' | 'gallery'; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.source, pressed && { opacity: 0.8 }]}>
      <View style={styles.sourceCircle}>
        <Icon name={icon} size={36} color={colors.white} />
      </View>
      <Text style={styles.sourceLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dark: { flex: 1, backgroundColor: 'rgba(17,17,20,0.96)' },
  closeRow: { alignItems: 'flex-end', paddingHorizontal: 14 },
  sources: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 36, paddingBottom: 80 },
  source: { alignItems: 'center', gap: 10 },
  sourceCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 6,
    borderColor: colors.white,
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceLabel: { color: colors.white, fontSize: 16, fontWeight: '600' },
  hint: { color: 'rgba(255,255,255,0.6)', fontSize: 13, textAlign: 'center', marginHorizontal: 40 },
  pinWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingBottom: 44 },
  pickerTop: { position: 'absolute', left: 16, right: 16 },
  pickerHint: { backgroundColor: colors.white, borderRadius: radius.md, padding: 12, ...shadow },
  pickerHintText: { fontSize: 14, color: colors.text, textAlign: 'center' },
  pickerBottom: { position: 'absolute', left: 16, right: 16, bottom: 0, flexDirection: 'row', gap: 10 },
  formHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, marginBottom: 12 },
  formTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  preview: { marginHorizontal: 14, borderRadius: radius.lg, backgroundColor: colors.tealPale, maxHeight: 420 },
  card: { backgroundColor: colors.white, marginHorizontal: 14, marginTop: 12, borderRadius: radius.md, padding: 14, gap: 4, ...shadow, shadowOpacity: 0.06 },
  label: { fontSize: 12, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { fontSize: 17, fontWeight: '600', color: colors.text },
  small: { fontSize: 12, color: colors.muted },
  warn: { fontSize: 13, color: colors.red },
  shifts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  shift: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.tealPale },
  shiftText: { fontSize: 13, fontWeight: '600', color: colors.text },
  linkBtn: { alignSelf: 'flex-start', paddingVertical: 4 },
  link: { color: colors.teal, fontWeight: '700', fontSize: 14 },
  input: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
  btn: {
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    ...shadow,
  },
  btnGhost: { backgroundColor: colors.white },
  btnText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  publish: { marginHorizontal: 14, marginTop: 20, marginBottom: 10 },
});
