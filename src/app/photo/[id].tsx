import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Share, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
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
  boundsAround, cachedPhoto, deletePhoto, fetchPhotoFull, fetchPhotosV2, hideAuthor, photoSource, reportPhoto, setLike, type ReportReason,
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
  const { width, height } = useWindowDimensions();
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const [photo, setPhoto] = useState<Photo | null>(cachedPhoto(id) ?? null);
  const [failed, setFailed] = useState<null | 'gone' | 'error'>(null);
  const [attempt, setAttempt] = useState(0);
  const [others, setOthers] = useState<Photo[]>([]);
  const [menu, setMenu] = useState<null | 'actions' | 'report'>(null);
  const [img, setImg] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    setFailed(null);
    fetchPhotoFull(id, uid)
      .then((p) => (p ? setPhoto(p) : setFailed('gone')))
      .catch(() => setFailed((f) => (cachedPhoto(id) ? null : 'error'))); // есть копия из ленты — показываем её
  }, [id, uid, attempt]);

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

  // Полноэкранный просмотр: тап — спрятать всё, щипок/двойной тап — приблизить, свайп вниз — закрыть
  const [full, setFull] = useState(false);
  const fullP = useSharedValue(0); // 0 — обычный вид, 1 — полный экран
  const fullSV = useSharedValue(0);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  const drag = useSharedValue(0);
  const zooming = useSharedValue(0);
  const sheetH = useSharedValue(0);
  const imgBottom = useSharedValue(height * 0.3);
  const shade = useSharedValue(1); // мягкое затемнение сверху: видно при открытии, потом растворяется
  const chromeAway = useSharedValue(0); // 1 — кнопки уехали наверх (пока щипаем или тянем фото)
  useEffect(() => {
    shade.value = withDelay(2000, withTiming(0, { duration: 700, easing: Easing.inOut(Easing.cubic) }));
  }, [shade]);

  const setFullMode = useCallback(
    (on: boolean) => {
      setFull(on);
      fullSV.value = on ? 1 : 0;
      fullP.value = withTiming(on ? 1 : 0, { duration: 300, easing: Easing.out(Easing.cubic) });
      if (!on) {
        scale.value = withTiming(1);
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        savedScale.value = 1;
        savedTx.value = 0;
        savedTy.value = 0;
      }
    },
    [fullP, fullSV, scale, tx, ty, savedScale, savedTx, savedTy],
  );
  const toggleFull = useCallback(() => setFullMode(fullSV.value === 0), [setFullMode, fullSV]);
  const goBack = useCallback(() => router.back(), []);

  const gesture = useMemo(() => {
    const single = Gesture.Tap().onEnd(() => scheduleOnRN(toggleFull));
    const double = Gesture.Tap()
      .numberOfTaps(2)
      .onEnd((e) => {
        if (fullSV.value === 0) {
          burst.value = withSequence(withTiming(1, { duration: 120 }), withTiming(0, { duration: 450 }));
          scheduleOnRN(toggleLike, true);
          return;
        }
        if (scale.value > 1.05) {
          scale.value = withSpring(1, { damping: 18 });
          tx.value = withSpring(0, { damping: 18 });
          ty.value = withSpring(0, { damping: 18 });
          savedScale.value = 1;
          savedTx.value = 0;
          savedTy.value = 0;
        } else {
          const k = 2.5; // приближаем к точке касания
          const nx = (width / 2 - e.x) * (k - 1);
          const ny = (height / 2 - e.y) * (k - 1);
          scale.value = withSpring(k, { damping: 18 });
          tx.value = withSpring(nx, { damping: 18 });
          ty.value = withSpring(ny, { damping: 18 });
          savedScale.value = k;
          savedTx.value = nx;
          savedTy.value = ny;
        }
      });
    const away = () => {
      'worklet';
      chromeAway.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) });
    };
    const back = () => {
      'worklet';
      chromeAway.value = withSpring(0, { damping: 15, stiffness: 180 });
    };
    const pinch = Gesture.Pinch()
      .onStart(() => {
        away();
        if (fullSV.value === 0) scheduleOnRN(setFullMode, true);
      })
      .onUpdate((e) => {
        scale.value = Math.min(5, Math.max(0.8, savedScale.value * e.scale));
      })
      .onEnd(() => {
        if (scale.value < 1) {
          scale.value = withSpring(1);
          tx.value = withSpring(0);
          ty.value = withSpring(0);
          savedTx.value = 0;
          savedTy.value = 0;
        }
        savedScale.value = Math.max(1, scale.value);
        back();
      });
    const pan = Gesture.Pan()
      .activeOffsetX([-12, 12])
      .activeOffsetY([-12, 12])
      .onStart(() => {
        zooming.value = scale.value > 1.05 ? 1 : 0;
        away();
      })
      .onUpdate((e) => {
        if (zooming.value) {
          tx.value = savedTx.value + e.translationX;
          ty.value = savedTy.value + e.translationY;
        } else {
          drag.value = Math.max(0, e.translationY);
        }
      })
      .onEnd((e) => {
        if (zooming.value) {
          // не даём увести снимок за края
          const mx = (width * (scale.value - 1)) / 2;
          const my = (height * (scale.value - 1)) / 2;
          const cx = Math.min(mx, Math.max(-mx, tx.value));
          const cy = Math.min(my, Math.max(-my, ty.value));
          tx.value = withSpring(cx, { damping: 20 });
          ty.value = withSpring(cy, { damping: 20 });
          savedTx.value = cx;
          savedTy.value = cy;
          back();
          return;
        }
        if (drag.value > 120 || e.velocityY > 900) {
          drag.value = withTiming(height * 0.5, { duration: 200 });
          scheduleOnRN(goBack);
        } else {
          drag.value = withSpring(0, { damping: 18 });
          back();
        }
      });
    return Gesture.Race(Gesture.Simultaneous(pinch, pan), Gesture.Exclusive(double, single));
  }, [toggleFull, setFullMode, goBack, toggleLike, width, height]); // eslint-disable-line react-hooks/exhaustive-deps

  const viewerStyle = useAnimatedStyle(() => {
    const k = Math.min(1, drag.value / (height * 0.6));
    return { opacity: 1 - k * 0.7, transform: [{ translateY: drag.value }, { scale: 1 - k * 0.2 }] };
  });
  const coverStyle = useAnimatedStyle(() => ({ opacity: 1 - fullP.value, bottom: imgBottom.value }));
  const containStyle = useAnimatedStyle(() => ({
    opacity: fullP.value,
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));
  const chromeStyle = useAnimatedStyle(() => {
    const k = Math.max(fullP.value, chromeAway.value);
    return { transform: [{ translateY: -k * (insets.top + 80) }, { scale: 1 - k * 0.15 }] };
  });
  const shadeStyle = useAnimatedStyle(() => ({ opacity: shade.value * (1 - chromeAway.value) }));
  const sheetStyle = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(1, drag.value / 150),
    transform: [{ translateY: fullP.value * (sheetH.value + 40) }],
  }));

  if (failed === 'error' && !photo) {
    return (
      <View style={[styles.root, styles.center, { padding: 32 }]}>
        <Text style={styles.goneTitle}>Не удалось загрузить фото</Text>
        <Text style={styles.goneText}>Проверьте интернет и попробуйте ещё раз.</Text>
        <PillButton title="Повторить" onPress={() => setAttempt((a) => a + 1)} style={{ marginTop: 24, alignSelf: 'stretch' }} />
        <PillButton title="Назад" kind="quiet" onPress={() => router.back()} style={{ marginTop: 10, alignSelf: 'stretch' }} />
      </View>
    );
  }
  if (failed === 'gone' || photo?.hidden) {
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
      <StatusBar style="light" hidden={full} animated />
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.viewer, viewerStyle]} collapsable={false}>
          {/* Обычный вид: снимок над панелью автора */}
          <Animated.View style={[styles.cover, coverStyle]}>
            <Image
              source={photoSource(photo.storage_path)}
              style={styles.fill}
              contentFit="cover"
              transition={{ duration: 450, effect: 'cross-dissolve' }}
              onLoad={() => setImg('ok')}
              onError={() => setImg('error')}
            />
            {img === 'loading' && <ActivityIndicator style={styles.imgState} color={D.paper} />}
            {img === 'error' && (
              <View style={styles.imgState}>
                <Icon name="eyeOff" size={28} color={D.paper} />
                <Text style={styles.imgErr}>Снимок не загрузился</Text>
              </View>
            )}
            <Animated.View pointerEvents="none" style={[styles.shadeTop, shadeStyle]} />
            <Animated.View pointerEvents="none" style={[styles.burst, burstStyle]}>
              <Icon name="heartFill" size={96} color={D.sun} />
            </Animated.View>
            <View style={styles.stamp}>
              <Text style={styles.stampText}>{stamp(taken)}</Text>
            </View>
          </Animated.View>
          {/* Полный экран: снимок целиком, можно приближать */}
          <Animated.View pointerEvents="none" style={[styles.fill, containStyle]}>
            <Image source={photoSource(photo.storage_path)} style={styles.fill} contentFit="contain" />
          </Animated.View>
        </Animated.View>
      </GestureDetector>

      <Animated.View style={[styles.topRow, { top: insets.top + 8 }, chromeStyle]} pointerEvents={full ? 'none' : 'box-none'}>
        <RoundButton icon="back" tone="glass" label="Назад" onPress={() => router.back()} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <RoundButton icon="share" tone="glass" label="Поделиться" onPress={() => Share.share({ message: `Момент в DreamApp: ${photo.place_name ?? ''}, ${stamp(taken)}` })} />
          <RoundButton icon="more" tone="glass" label="Ещё" onPress={() => setMenu('actions')} />
        </View>
      </Animated.View>

      <Animated.View
        entering={SlideInDown.springify().damping(16).stiffness(140).mass(0.9)}
        style={styles.sheetWrap}
        pointerEvents={full ? 'none' : 'box-none'}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          const first = sheetH.value === 0;
          sheetH.value = h;
          imgBottom.value = first ? h - 28 : withTiming(h - 28, { duration: 250 });
        }}
      >
        <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }, sheetStyle]}>
          <View style={styles.authorRow}>
            {photo.author_avatar ? <Image source={{ uri: photo.author_avatar }} style={styles.avatar} /> : <View style={[styles.avatar, { backgroundColor: D.sun }]} />}
            <View style={{ flex: 1 }}>
              <Text style={styles.author}>{photo.author_name || photo.author_username || 'Путешественник'}</Text>
              <Text style={styles.sub} numberOfLines={1}>
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
              <Text style={styles.place} numberOfLines={1}>{photo.place_name}</Text>
            </View>
          ) : null}
          {photo.caption ? <Text style={styles.caption}>{photo.caption}</Text> : null}

          {others.length > 0 && (
            <Animated.View entering={FadeIn.duration(250)}>
              <Pressable onPress={openWhoElse} style={styles.who}>
                <View style={styles.avas}>
                  {authors.map((o, k) =>
                    o.author_avatar ? (
                      <Image key={o.user_id} source={{ uri: o.author_avatar }} style={[styles.whoAva, { marginLeft: k ? -8 : 0, zIndex: 10 - k }]} />
                    ) : (
                      <View key={o.user_id} style={[styles.whoAva, { marginLeft: k ? -8 : 0, backgroundColor: D.sun }]} />
                    ),
                  )}
                </View>
                <Text style={styles.whoTitle} numberOfLines={1}>
                  Ещё {others.length} {plural(others.length, 'снимок', 'снимка', 'снимков')} здесь <Text style={styles.whoSub}>±15 мин</Text>
                </Text>
                <Icon name="chevR" size={14} color={D.paper} />
              </Pressable>
            </Animated.View>
          )}
        </Animated.View>
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
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  viewer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  cover: { position: 'absolute', top: 0, left: 0, right: 0 },
  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  shadeTop: {
    position: 'absolute', left: 0, right: 0, top: 0, height: 200,
    experimental_backgroundImage: 'linear-gradient(180deg, rgba(15,14,12,0.42) 0%, rgba(15,14,12,0.18) 45%, rgba(15,14,12,0) 100%)',
  },
  burst: { position: 'absolute', alignSelf: 'center', top: '40%' },
  imgState: { position: 'absolute', alignSelf: 'center', top: '42%', alignItems: 'center', gap: 8 },
  imgErr: { fontFamily: F.sans, fontSize: 14, color: D.paper, opacity: 0.7 },
  stamp: { position: 'absolute', left: 16, bottom: 44, backgroundColor: 'rgba(15,14,12,0.55)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  stampText: { fontFamily: F.mono, fontSize: 11, color: D.paper, letterSpacing: 0.6 },
  topRow: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', zIndex: 10 },
  sheet: { backgroundColor: D.night2, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 18, gap: 10 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  author: { fontFamily: F.sansSemi, fontSize: 16, color: D.paper },
  sub: { fontFamily: F.sans, fontSize: 13, color: D.paper, opacity: 0.55, marginTop: 2 },
  like: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 4 },
  likeCount: { fontFamily: F.sansMedium, fontSize: 14, color: D.paper },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  place: { fontFamily: F.sans, fontSize: 14, color: D.paper, opacity: 0.85 },
  caption: { fontFamily: F.sans, fontSize: 15, lineHeight: 22, color: D.paper },
  who: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: D.night3, borderRadius: 16, paddingVertical: 9, paddingHorizontal: 12, marginTop: 2 },
  avas: { flexDirection: 'row' },
  whoAva: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: D.night3 },
  whoTitle: { flex: 1, fontFamily: F.sansMedium, fontSize: 14, color: D.paper },
  whoSub: { fontFamily: F.sans, fontSize: 13, color: 'rgba(244,239,230,0.55)' },
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
