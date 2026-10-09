// C1 · Гостевой барьер и C2 · Камера или галерея — листы поверх карты (дуга вместо бара — утверждено 09.10)
import { Image } from 'expo-image';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { AssetField, MediaType, Query, requestPermissionsAsync, type Asset } from 'expo-media-library';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Icon } from '@/components/Icon';
import { useAuth } from '@/lib/auth';
import { D, F, SHEET_SPRING } from '@/lib/design';
import { draftFromPicker, setDraft, type Draft } from '@/lib/draft';
import { supabase } from '@/lib/supabase';

type Recent = { asset: Asset; uri: string; lat: number | null; lng: number | null; time: number | null };

export default function NewMomentSheet() {
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const close = () => router.back();
  const spring = SlideInDown.springify().damping(SHEET_SPRING.damping).stiffness(SHEET_SPRING.stiffness).mass(SHEET_SPRING.mass);

  return (
    <Animated.View entering={FadeIn.duration(180)} style={styles.dim}>
      <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Закрыть" />
      <Animated.View entering={spring} style={[styles.sheet, { height: (session ? 480 : 460) - 34 + Math.max(insets.bottom, 16) }]}>
        <Pressable onPress={close} style={styles.grip} hitSlop={{ top: 10, bottom: 6, left: 30, right: 30 }} accessibilityLabel="Закрыть">
          <Svg width={25} height={8}>
            <Path d="M 1.5 1.5 C 8.5 5 16.5 5 23.5 1.5" stroke="rgba(22,19,15,0.28)" strokeWidth={2} strokeLinecap="round" fill="none" />
          </Svg>
        </Pressable>
        {session ? <Source /> : <Guest onClose={close} />}
      </Animated.View>
    </Animated.View>
  );
}

/** C1: войти, чтобы публиковать */
function Guest({ onClose }: { onClose: () => void }) {
  // вход открывается поверх листа; после входа лист сам станет C2 (сессия появилась)
  const signIn = () => router.push('/sign-in');
  const [avatars, setAvatars] = useState<string[]>([]);
  useEffect(() => {
    supabase
      .from('profiles')
      .select('avatar_url')
      .not('avatar_url', 'is', null)
      .limit(5)
      .then(({ data }) => setAvatars((data ?? []).map((r: any) => r.avatar_url).filter(Boolean)));
  }, []);
  return (
    <View>
      <View style={styles.avatars}>
        {avatars.map((a, i) => (
          <Image key={a} source={{ uri: a }} style={[styles.avatar, { marginLeft: i ? -12 : 0, zIndex: 10 - i }]} />
        ))}
      </View>
      <Text style={styles.gateTitle}>Войдите, чтобы опубликовать момент</Text>
      <Text style={styles.gateText}>Смотреть карту можно и так. А чтобы выложить снимок и найти совпадения, нужен профиль — это 30 секунд.</Text>
      <Pressable onPress={signIn} style={({ pressed }) => [styles.button, { marginTop: 26 }, pressed && { opacity: 0.88 }]}>
        <Text style={styles.buttonText}>Войти по почте</Text>
      </Pressable>
      <Pressable onPress={onClose} hitSlop={10} style={styles.later}>
        <Text style={styles.laterText}>Не сейчас</Text>
      </Pressable>
    </View>
  );
}

/** C2: снять сейчас, из галереи или один из недавних снимков */
function Source() {
  const { width } = useWindowDimensions();
  const [recent, setRecent] = useState<Recent[] | null>(null);
  const [busy, setBusy] = useState(false);
  const thumb = (width - 48 - 24) / 4;

  useEffect(() => {
    (async () => {
      const perm = await requestPermissionsAsync().catch(() => null);
      if (!perm?.granted) return setRecent([]);
      const assets = await new Query()
        .eq(AssetField.MEDIA_TYPE, MediaType.IMAGE)
        .orderBy({ key: AssetField.CREATION_TIME, ascending: false })
        .limit(4)
        .exe();
      const list = await Promise.all(
        assets.map(async (asset) => {
          const [loc, time] = await Promise.all([asset.getLocation().catch(() => null), asset.getCreationTime().catch(() => null)]);
          return { asset, uri: asset.id, lat: loc?.latitude ?? null, lng: loc?.longitude ?? null, time };
        }),
      );
      setRecent(list);
    })().catch(() => setRecent([]));
  }, []);

  const go = (d: Draft) => {
    setDraft(d);
    router.replace('/add');
  };

  const pick = async (src: 'camera' | 'gallery') => {
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], exif: true, base64: true, quality: 0.7 };
    if (src === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return Alert.alert('Нужен доступ к камере', 'Разрешите его в настройках телефона.');
    }
    const res = src === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets?.[0]) return;
    go(draftFromPicker(res.assets[0], src === 'camera'));
  };

  // Недавний снимок: место и время — из фототеки, сам файл — в JPEG для загрузки
  const pickRecent = async (r: Recent) => {
    setBusy(true);
    try {
      const src = await r.asset.getUri();
      const ctx = ImageManipulator.ImageManipulator.manipulate(src);
      const w = await r.asset.getWidth();
      if (w > 2048) ctx.resize({ width: 2048, height: null });
      const img = await (await ctx.renderAsync()).saveAsync({ format: ImageManipulator.SaveFormat.JPEG, compress: 0.7, base64: true });
      go({
        uri: img.uri,
        base64: img.base64 ?? '',
        mimeType: 'image/jpeg',
        width: img.width,
        height: img.height,
        lat: r.lat,
        lng: r.lng,
        locationSource: 'exif',
        takenAt: r.time ? new Date(r.time) : null,
        timeSource: 'snapshot',
      });
    } catch {
      Alert.alert('Не удалось открыть снимок', 'Попробуйте выбрать его через «Из галереи».');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <Text style={styles.title}>Новый момент</Text>
      <View style={styles.tiles}>
        <Pressable onPress={() => pick('camera')} style={({ pressed }) => [styles.tile, { backgroundColor: D.sun }, pressed && { opacity: 0.9 }]}>
          <Icon name="camera" size={30} color={D.white} />
          <View style={styles.tileText}>
            <Text style={[styles.tileTitle, { color: D.white }]}>Снять сейчас</Text>
            <Text style={[styles.tileSub, { color: 'rgba(255,255,255,0.8)' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>место и время — сразу</Text>
          </View>
        </Pressable>
        <Pressable onPress={() => pick('gallery')} style={({ pressed }) => [styles.tile, { backgroundColor: D.paper }, pressed && { opacity: 0.9 }]}>
          <Icon name="gallery" size={30} color={D.ink} />
          <View style={styles.tileText}>
            <Text style={styles.tileTitle}>Из галереи</Text>
            <Text style={styles.tileSub} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>возьмём их из снимка</Text>
          </View>
        </Pressable>
      </View>

      {recent && recent.length > 0 && (
        <Animated.View entering={FadeIn.duration(200)}>
          <Text style={styles.label}>НЕДАВНИЕ СНИМКИ</Text>
          <View style={styles.recentRow}>
            {recent.map((r) => (
              <Pressable key={r.uri} disabled={busy} onPress={() => pickRecent(r)} style={[styles.recent, { width: thumb, height: thumb }]}>
                <Image source={{ uri: r.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
                <View style={[styles.geo, { backgroundColor: r.lat != null && r.time ? D.sun : D.ink40 }]}>
                  <Icon name="pin" size={12} color={D.white} />
                </View>
              </Pressable>
            ))}
          </View>
          <View style={styles.legend}>
            <View style={styles.legendDot} />
            <Text style={styles.legendText}>в снимке есть место и время</Text>
          </View>
        </Animated.View>
      )}
      {busy && <ActivityIndicator color={D.sun} style={{ marginTop: 12 }} />}
    </View>
  );
}

const styles = StyleSheet.create({
  dim: { flex: 1, backgroundColor: 'rgba(15,14,12,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: D.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    shadowColor: '#17120D',
    shadowOpacity: 0.14,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: -6 },
  },
  grip: { alignSelf: 'center', height: 26, paddingTop: 9 },
  // C1
  avatars: { flexDirection: 'row', marginTop: 14, height: 44 },
  avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 3, borderColor: D.white, backgroundColor: D.paper2 },
  gateTitle: { marginTop: 20, fontFamily: F.serif, fontSize: 30, lineHeight: 36, color: D.ink },
  gateText: { marginTop: 10, fontFamily: F.sans, fontSize: 15, lineHeight: 22, color: D.ink60 },
  later: { alignSelf: 'center', marginTop: 20 },
  laterText: { fontFamily: F.sansSemi, fontSize: 15, color: D.ink60 },
  button: { backgroundColor: D.sun, borderRadius: 999, paddingVertical: 17, alignItems: 'center' },
  buttonText: { fontFamily: F.sansSemi, fontSize: 16, lineHeight: 20, color: D.white },
  // C2
  title: { fontFamily: F.serifItalic, fontSize: 30, lineHeight: 40, color: D.ink },
  tiles: { flexDirection: 'row', gap: 13, marginTop: 16 },
  tile: { flex: 1, height: 140, borderRadius: 22, padding: 18, justifyContent: 'space-between' },
  tileText: { gap: 4 },
  tileTitle: { fontFamily: F.sansSemi, fontSize: 16, lineHeight: 20, color: D.ink },
  tileSub: { fontFamily: F.sans, fontSize: 12, lineHeight: 16, color: D.ink60 },
  label: { marginTop: 24, fontFamily: F.mono, fontSize: 11, lineHeight: 15, letterSpacing: 0.88, color: D.ink60 },
  recentRow: { flexDirection: 'row', gap: 8, marginTop: 11 },
  recent: { borderRadius: 14, overflow: 'hidden', backgroundColor: D.paper2 },
  geo: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16 },
  legendDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: D.sun },
  legendText: { fontFamily: F.sans, fontSize: 12, color: D.ink60 },
});
