import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Share, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/components/Icon';
import { PillButton } from '@/components/ui/PillButton';
import { RoundButton } from '@/components/ui/RoundButton';
import { useAuth } from '@/lib/auth';
import { D, F, STEP_MIN } from '@/lib/design';
import {
  boundsAround, cachedPhoto, deletePhoto, fetchPhotoFull, fetchPhotosV2, hideAuthor, photoUrl, reportPhoto, setLike, type ReportReason,
} from '@/lib/photos';
import type { Photo } from '@/lib/types';

const pad = (n: number) => String(n).padStart(2, '0');
const MON = ['ЯНВ', 'ФЕВ', 'МАР', 'АПР', 'МАЯ', 'ИЮН', 'ИЮЛ', 'АВГ', 'СЕН', 'ОКТ', 'НОЯ', 'ДЕК'];
const stamp = (d: Date) => `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()} · ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const ago = (d: Date) => {
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days < 1) return 'сегодня';
  if (days < 2) return 'вчера';
  if (days < 30) return `${days} дн. назад`;
  const y = Math.floor(days / 365);
  if (y >= 1) return y === 1 ? 'год назад' : y < 5 ? `${y} года назад` : `${y} лет назад`;
  return `${Math.floor(days / 30)} мес. назад`;
};

const REASONS: { key: ReportReason; label: string }[] = [
  { key: 'face_without_consent', label: 'На фото я, без моего согласия' },
  { key: 'inappropriate', label: 'Неприемлемое содержание' },
  { key: 'spam', label: 'Спам или реклама' },
  { key: 'wrong_place_or_time', label: 'Не то место или время' },
  { key: 'other', label: 'Другое' },
];

// B6 · Фото: снимок, автор, лайк, «кто ещё был здесь», меню с жалобой
export default function PhotoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const [photo, setPhoto] = useState<Photo | null>(cachedPhoto(id) ?? null);
  const [failed, setFailed] = useState(false);
  const [others, setOthers] = useState<Photo[]>([]);
  const [menu, setMenu] = useState<null | 'actions' | 'report'>(null);

  useEffect(() => {
    fetchPhotoFull(id, uid)
      .then((p) => (p ? setPhoto(p) : setFailed(true)))
      .catch(() => setFailed(true));
  }, [id, uid]);

  // Кто ещё снимал это место ±15 минут
  useEffect(() => {
    if (!photo) return;
    const t = new Date(photo.taken_at).getTime();
    fetchPhotosV2(boundsAround(photo.lat, photo.lng, 100), new Date(t - 15 * 60000), new Date(t + 15 * 60000), 100)
      .then((list) => setOthers(list.filter((p) => p.id !== photo.id)))
      .catch(() => {});
  }, [photo?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Лайк: оптимистично, с «пружинкой» сердца
  const heart = useSharedValue(1);
  const burst = useSharedValue(0);
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: heart.value }] }));
  const burstStyle = useAnimatedStyle(() => ({ opacity: burst.value, transform: [{ scale: 0.6 + burst.value * 0.6 }] }));

  const toggleLike = async (forceOn = false) => {
    if (!photo) return;
    if (!uid) return router.push('/sign-in');
    const on = forceOn ? true : !photo.liked_by_me;
    if (on === photo.liked_by_me) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    heart.value = withSequence(withSpring(1.35, { damping: 6, stiffness: 400 }), withSpring(1, { damping: 10 }));
    const prev = photo;
    setPhoto({ ...photo, liked_by_me: on, like_count: Math.max(0, (photo.like_count ?? 0) + (on ? 1 : -1)) });
    try {
      await setLike(photo.id, uid, on);
    } catch {
      setPhoto(prev);
    }
  };

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      burst.value = withSequence(withTiming(1, { duration: 120 }), withTiming(0, { duration: 450 }));
      scheduleOnRN(toggleLike, true);
    });

  if (failed || photo?.hidden) {
    return (
      <View style={[styles.root, styles.center, { padding: 32 }]}>
        <View style={styles.goneIcon}>
          <Icon name="eyeOff" size={36} color={D.paper} />
        </View>
        <Text style={styles.goneTitle}>Фото больше недоступно</Text>
        <Text style={styles.goneText}>Автор удалил его или оно скрыто после жалоб.</Text>
        <PillButton title="Назад" onPress={() => router.back()} style={{ marginTop: 24, alignSelf: 'stretch' }} />
      </View>
    );
  }
  if (!photo) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={D.paper} />
      </View>
    );
  }

  const taken = new Date(photo.taken_at);
  const mine = uid === photo.user_id;
  const imageH = height * 0.62;
  const authors = Array.from(new Map(others.map((o) => [o.user_id, o])).values()).slice(0, 4);
  const windowStart = new Date(taken);
  windowStart.setMinutes(Math.floor(taken.getMinutes() / STEP_MIN) * STEP_MIN, 0, 0);

  const openWhoElse = () =>
    router.push({
      pathname: '/moment',
      params: { lat: String(photo.lat), lng: String(photo.lng), radius: '120', from: String(windowStart.getTime()), title: photo.place_name ?? '' },
    });

  const act = async (fn: () => Promise<void>, done: string) => {
    if (!uid) {
      setMenu(null);
      return router.push('/sign-in');
    }
    try {
      await fn();
      setMenu(null);
      Alert.alert(done);
    } catch (e: any) {
      Alert.alert('Не получилось', e?.message ?? '');
    }
  };

  return (
    <View style={styles.root}>
      <GestureDetector gesture={doubleTap}>
        <View style={{ height: imageH }} collapsable={false}>
          <Image source={{ uri: photoUrl(photo.storage_path) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} />
          <View style={[styles.shadeTop]} />
          <Animated.View pointerEvents="none" style={[styles.burst, burstStyle]}>
            <Icon name="heartFill" size={96} color={D.sun} />
          </Animated.View>
          <View style={styles.stamp}>
            <Text style={styles.stampText}>{stamp(taken)}</Text>
          </View>
        </View>
      </GestureDetector>

      <View style={[styles.topRow, { top: insets.top + 8 }]}>
        <RoundButton icon="back" tone="glass" label="Назад" onPress={() => router.back()} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <RoundButton icon="share" tone="glass" label="Поделиться" onPress={() => Share.share({ message: `Момент в DreamApp: ${photo.place_name ?? ''}, ${stamp(taken)}` })} />
          <RoundButton icon="more" tone="glass" label="Ещё" onPress={() => setMenu('actions')} />
        </View>
      </View>

      <Animated.View entering={FadeInDown.springify().damping(18)} style={[styles.sheet, { paddingBottom: insets.bottom + 16, top: imageH - 28 }]}>
        <View style={styles.authorRow}>
          {photo.author_avatar ? <Image source={{ uri: photo.author_avatar }} style={styles.avatar} /> : <View style={[styles.avatar, { backgroundColor: D.sun }]} />}
          <View style={{ flex: 1 }}>
            <Text style={styles.author}>{photo.author_name || photo.author_username || 'Путешественник'}</Text>
            <Text style={styles.sub}>
              снял в {pad(taken.getHours())}:{pad(taken.getMinutes())} · {ago(taken)}
            </Text>
          </View>
          <Pressable onPress={() => toggleLike()} hitSlop={10} style={styles.like} accessibilityLabel={photo.liked_by_me ? 'Убрать лайк' : 'Лайк'}>
            <Animated.View style={heartStyle}>
              <Icon name={photo.liked_by_me ? 'heartFill' : 'heart'} size={22} color={photo.liked_by_me ? D.sun : D.paper} />
            </Animated.View>
            <Text style={styles.likeCount}>{photo.like_count ?? 0}</Text>
          </Pressable>
        </View>

        {photo.place_name ? (
          <View style={styles.placeRow}>
            <Icon name="pin" size={15} color={D.sun} />
            <Text style={styles.place}>{photo.place_name}</Text>
          </View>
        ) : null}
        {photo.caption ? <Text style={styles.caption}>{photo.caption}</Text> : null}

        {others.length > 0 && (
          <Animated.View entering={FadeIn.delay(150)}>
            <Pressable onPress={openWhoElse} style={styles.who}>
              <View style={styles.avas}>
                {authors.map((o, k) =>
                  o.author_avatar ? (
                    <Image key={o.user_id} source={{ uri: o.author_avatar }} style={[styles.whoAva, { marginLeft: k ? -10 : 0, zIndex: 10 - k }]} />
                  ) : (
                    <View key={o.user_id} style={[styles.whoAva, { marginLeft: k ? -10 : 0, backgroundColor: D.sun }]} />
                  ),
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.whoTitle}>Ещё {others.length} {plural(others.length, 'снимок', 'снимка', 'снимков')}</Text>
                <Text style={styles.whoSub}>здесь ±15 минут — может, вы в кадре?</Text>
              </View>
              <View style={styles.go}>
                <Icon name="arrow" size={16} color={D.white} />
              </View>
            </Pressable>
          </Animated.View>
        )}
      </Animated.View>

      {/* Меню ⋯ — B7 */}
      {menu && (
        <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenu(null)} />
          <Animated.View entering={SlideInDown.springify().damping(20)} exiting={SlideOutDown.duration(180)} style={[styles.menu, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.handle} />
            {menu === 'actions' ? (
              <>
                <MenuRow icon="flag" label="Пожаловаться на фото" danger onPress={() => setMenu('report')} />
                {!mine && (
                  <MenuRow
                    icon="eyeOff"
                    label="Скрыть фото этого автора"
                    onPress={() => act(() => hideAuthor(uid!, photo.user_id), 'Автор скрыт. Его фото больше не появятся у вас на карте.')}
                  />
                )}
                {mine && (
                  <MenuRow
                    icon="trash"
                    label="Удалить моё фото"
                    danger
                    onPress={() =>
                      Alert.alert('Удалить фото?', 'Его больше никто не увидит.', [
                        { text: 'Отмена', style: 'cancel' },
                        { text: 'Удалить', style: 'destructive', onPress: () => deletePhoto(photo).then(() => router.back()).catch((e) => Alert.alert('Не получилось', e?.message ?? '')) },
                      ])
                    }
                  />
                )}
              </>
            ) : (
              <>
                <Text style={styles.menuTitle}>Что не так с фото?</Text>
                {REASONS.map((r) => (
                  <MenuRow key={r.key} label={r.label} onPress={() => act(() => reportPhoto(photo.id, uid!, r.key), 'Спасибо! Мы проверим фото.')} />
                ))}
              </>
            )}
            <PillButton title="Отмена" kind="quiet" onPress={() => setMenu(null)} style={{ marginTop: 10 }} />
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}

function MenuRow({ icon, label, danger, onPress }: { icon?: IconName; label: string; danger?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: D.paper }]}>
      {icon && <Icon name={icon} size={20} color={danger ? D.sun : D.ink} />}
      <Text style={[styles.menuText, danger && { color: D.sun }]}>{label}</Text>
    </Pressable>
  );
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: D.night },
  center: { alignItems: 'center', justifyContent: 'center' },
  shadeTop: { position: 'absolute', left: 0, right: 0, top: 0, height: 130, backgroundColor: 'rgba(15,14,12,0.35)' },
  burst: { position: 'absolute', alignSelf: 'center', top: '40%' },
  stamp: { position: 'absolute', left: 16, bottom: 44, backgroundColor: 'rgba(15,14,12,0.55)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  stampText: { fontFamily: F.mono, fontSize: 11, color: D.paper, letterSpacing: 0.6 },
  topRow: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: D.night2, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 22, gap: 12 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  author: { fontFamily: F.sansSemi, fontSize: 16, color: D.paper },
  sub: { fontFamily: F.sans, fontSize: 13, color: D.paper, opacity: 0.55, marginTop: 2 },
  like: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 4 },
  likeCount: { fontFamily: F.sansMedium, fontSize: 14, color: D.paper },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  place: { fontFamily: F.sans, fontSize: 14, color: D.paper, opacity: 0.85 },
  caption: { fontFamily: F.sans, fontSize: 15, lineHeight: 22, color: D.paper },
  who: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: D.night3, borderRadius: 20, padding: 14, marginTop: 4 },
  avas: { flexDirection: 'row' },
  whoAva: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: D.night3 },
  whoTitle: { fontFamily: F.sansSemi, fontSize: 15, color: D.paper },
  whoSub: { fontFamily: F.sans, fontSize: 13, color: D.paper, opacity: 0.55, marginTop: 2 },
  go: { width: 36, height: 36, borderRadius: 18, backgroundColor: D.sun, alignItems: 'center', justifyContent: 'center' },
  goneIcon: { width: 96, height: 96, borderRadius: 48, backgroundColor: 'rgba(244,239,230,0.08)', alignItems: 'center', justifyContent: 'center' },
  goneTitle: { fontFamily: F.serif, fontSize: 28, color: D.paper, marginTop: 24, textAlign: 'center' },
  goneText: { fontFamily: F.sans, fontSize: 15, lineHeight: 22, color: D.paper, opacity: 0.6, marginTop: 10, textAlign: 'center' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,14,12,0.55)', justifyContent: 'flex-end' },
  menu: { backgroundColor: D.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 16, paddingTop: 10 },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: D.line, marginBottom: 10 },
  menuTitle: { fontFamily: F.serif, fontSize: 22, color: D.ink, paddingHorizontal: 8, marginBottom: 6 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15, paddingHorizontal: 8, borderRadius: 12 },
  menuText: { fontFamily: F.sans, fontSize: 16, color: D.ink },
});
