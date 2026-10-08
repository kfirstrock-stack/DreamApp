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
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/components/Icon';
import { MomentStrip, stripRange } from '@/components/photo/MomentStrip';
import { PillButton } from '@/components/ui/PillButton';
import { RoundButton } from '@/components/ui/RoundButton';
import { useAuth } from '@/lib/auth';
import { D, F, SHEET_SPRING, STEP_MIN } from '@/lib/design';
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

// Снимок двигается плавно, без пружины (пружина — только у панелей)
const SMOOTH = { duration: 320, easing: Easing.out(Easing.cubic) };

// Панель автора помним открытой/свёрнутой между снимками
let sheetOpenPref = true;

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
  const landscape = width > height;
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const [photo, setPhoto] = useState<Photo | null>(cachedPhoto(id) ?? null);
  const [failed, setFailed] = useState<null | 'gone' | 'error'>(null);
  const [attempt, setAttempt] = useState(0);
  const [nearby, setNearby] = useState<Photo[]>([]);
  const [nearbyLoaded, setNearbyLoaded] = useState(false); // снимки этого места вокруг момента (для шкалы и «кто ещё»)
  const [menu, setMenu] = useState<null | 'actions' | 'report'>(null);
  const [img, setImg] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    setFailed(null);
    fetchPhotoFull(id, uid)
      .then((p) => (p ? setPhoto(p) : setFailed('gone')))
      .catch(() => setFailed((f) => (cachedPhoto(id) ? null : 'error'))); // есть копия из ленты — показываем её
  }, [id, uid, attempt]);

  // Кто ещё снимал это место вокруг момента
  useEffect(() => {
    if (!photo) return;
    const t = new Date(photo.taken_at);
    const r = stripRange(t);
    const from = new Date(Math.min(r.from.getTime(), t.getTime() - 15 * 60000));
    const to = new Date(Math.max(r.to.getTime(), t.getTime() + 15 * 60000));
    fetchPhotosV2(boundsAround(photo.lat, photo.lng, 100), from, to, 300)
      .then((l) => {
        setNearby(l);
        setNearbyLoaded(true);
      })
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
    if (on) burst.value = withSequence(withTiming(1, { duration: 120 }), withTiming(0, { duration: 450 })); // сердце вспыхивает и на снимке
    const prev = photo;
    setPhoto({ ...photo, liked_by_me: on, like_count: Math.max(0, (photo.like_count ?? 0) + (on ? 1 : -1)) });
    try {
      await setLike(photo.id, uid, on);
    } catch {
      setPhoto(prev);
    }
  };

  // Просмотр: тап — спрятать интерфейс, двойной тап/щипок — полный кадр с приближением, свайп вниз — закрыть
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
  const imgBottom = useSharedValue(height * 0.22);

  // Панель автора: открыта — вся информация, свёрнута — только автор и место. Тянуть за ручку или тапнуть по ней
  const [open, setOpen] = useState(sheetOpenPref);
  const sheetFull = useSharedValue(0); // полная высота панели
  const sheetPeek = useSharedValue(0); // сколько видно в свёрнутом виде
  const off = useSharedValue(0); // насколько панель опущена (0 — открыта)
  const offStart = useSharedValue(0);
  const sheetDragging = useSharedValue(0);
  const openSV = useSharedValue(sheetOpenPref ? 1 : 0);
  const enter = useSharedValue(1); // выезд панели при открытии: 1 — за краем экрана, 0 — на месте
  const remember = useCallback((o: boolean) => {
    sheetOpenPref = o;
    setOpen(o);
    Haptics.selectionAsync().catch(() => {});
  }, []);
  const toggleSheet = useCallback(() => {
    const o = openSV.value === 0;
    openSV.value = o ? 1 : 0;
    off.value = withSpring(o ? 0 : Math.max(0, sheetFull.value - sheetPeek.value), SHEET_SPRING);
    remember(o);
  }, [openSV, off, sheetFull, sheetPeek, remember]); // eslint-disable-line react-hooks/exhaustive-deps
  const sheetPan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-8, 8])
        .failOffsetX([-20, 20])
        .onStart(() => {
          offStart.value = off.value;
          sheetDragging.value = 1;
        })
        .onUpdate((e) => {
          const m = Math.max(0, sheetFull.value - sheetPeek.value);
          let v = offStart.value + e.translationY;
          if (v < 0) v *= 0.25; // резинка за краями
          if (v > m) v = m + (v - m) * 0.25;
          off.value = v;
        })
        // onFinalize, а не onEnd: срабатывает и когда жест прерван (иначе панель застревала на полпути)
        .onFinalize((e) => {
          if (!sheetDragging.value) return;
          sheetDragging.value = 0;
          const m = Math.max(0, sheetFull.value - sheetPeek.value);
          const o = e.velocityY < -400 ? true : e.velocityY > 400 ? false : off.value < m / 2;
          const changed = (openSV.value === 1) !== o;
          openSV.value = o ? 1 : 0;
          off.value = withSpring(o ? 0 : m, { ...SHEET_SPRING, velocity: e.velocityY });
          if (changed) scheduleOnRN(remember, o);
        }),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const landSV = useSharedValue(landscape ? 1 : 0);
  useEffect(() => {
    landSV.value = landscape ? 1 : 0;
  }, [landscape, landSV]);
  const chromeAway = useSharedValue(0); // 1 — кнопки уехали наверх (пока щипаем или тянем фото)
  // Тап по фото прячет интерфейс: кнопки — вверх, панель — вниз; ещё тап — возвращает
  const [uiHidden, setUiHidden] = useState(false);
  const hideSV = useSharedValue(0);
  const hideP = useSharedValue(0);
  const setUi = useCallback(
    (hide: boolean) => {
      setUiHidden(hide);
      hideSV.value = hide ? 1 : 0;
      hideP.value = hide
        ? withTiming(1, { duration: 450, easing: Easing.inOut(Easing.cubic) }) // уходят неторопливо
        : withSpring(0, { damping: 16, stiffness: 180, mass: 0.8 });
    },
    [hideSV, hideP],
  );

  const setFullMode = useCallback(
    (on: boolean) => {
      setFull(on);
      fullSV.value = on ? 1 : 0;
      fullP.value = withTiming(on ? 1 : 0, { duration: 300, easing: Easing.out(Easing.cubic) });
      if (!on) {
        setUi(false); // из полного кадра возвращаемся к обычному виду со всем интерфейсом
        scale.value = withTiming(1, SMOOTH);
        tx.value = withTiming(0, SMOOTH);
        ty.value = withTiming(0, SMOOTH);
        savedScale.value = 1;
        savedTx.value = 0;
        savedTy.value = 0;
      }
    },
    [fullP, fullSV, scale, tx, ty, savedScale, savedTx, savedTy, setUi],
  );
  // Одинарный тап: в полном кадре — вернуться к обычному виду, иначе — спрятать/показать интерфейс
  const onSingleTap = useCallback(() => {
    if (fullSV.value === 1) setFullMode(false);
    else setUi(hideSV.value === 0);
  }, [fullSV, hideSV, setFullMode, setUi]);
  const goBack = useCallback(() => router.back(), []);

  const gesture = useMemo(() => {
    const single = Gesture.Tap().onEnd(() => scheduleOnRN(onSingleTap));
    const double = Gesture.Tap()
      .numberOfTaps(2)
      .onEnd((e) => {
        // Двойной тап: полный кадр и приближение к точке касания; повторный — отдалить
        if (fullSV.value === 0) {
          fullSV.value = 1;
          scheduleOnRN(setFullMode, true);
        } else if (scale.value > 1.05) {
          scale.value = withTiming(1, SMOOTH);
          tx.value = withTiming(0, SMOOTH);
          ty.value = withTiming(0, SMOOTH);
          savedScale.value = 1;
          savedTx.value = 0;
          savedTy.value = 0;
        } else {
          const k = 2.5; // приближаем к точке касания
          const nx = (width / 2 - e.x) * (k - 1);
          const ny = (height / 2 - e.y) * (k - 1);
          scale.value = withTiming(k, SMOOTH);
          tx.value = withTiming(nx, SMOOTH);
          ty.value = withTiming(ny, SMOOTH);
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
          scale.value = withTiming(1, SMOOTH);
          tx.value = withTiming(0, SMOOTH);
          ty.value = withTiming(0, SMOOTH);
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
          tx.value = withTiming(cx, SMOOTH);
          ty.value = withTiming(cy, SMOOTH);
          savedTx.value = cx;
          savedTy.value = cy;
          back();
          return;
        }
        if (drag.value > 120 || e.velocityY > 900) {
          drag.value = withTiming(height * 0.5, { duration: 200 });
          scheduleOnRN(goBack);
        } else {
          drag.value = withTiming(0, SMOOTH);
          back();
        }
      });
    return Gesture.Race(Gesture.Simultaneous(pinch, pan), Gesture.Exclusive(double, single));
  }, [onSingleTap, setFullMode, goBack, width, height]); // eslint-disable-line react-hooks/exhaustive-deps

  const viewerStyle = useAnimatedStyle(() => {
    const k = Math.min(1, drag.value / (height * 0.6));
    return { opacity: 1 - k * 0.7, transform: [{ translateY: drag.value }, { scale: 1 - k * 0.2 }] };
  });
  const coverStyle = useAnimatedStyle(() => ({ opacity: 1 - fullP.value, bottom: landSV.value ? 0 : imgBottom.value }));
  const landStyle = useAnimatedStyle(() => ({ opacity: 1 - Math.max(fullP.value, hideP.value) }));
  const containStyle = useAnimatedStyle(() => ({
    opacity: fullP.value,
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));
  const chromeStyle = useAnimatedStyle(() => {
    const k = Math.max(fullP.value, chromeAway.value, hideP.value);
    return { transform: [{ translateY: -k * (insets.top + 80) }, { scale: 1 - k * 0.15 }] };
  });
  const shadeStyle = useAnimatedStyle(() => ({ opacity: 1 - Math.max(chromeAway.value, hideP.value) }));
  const sheetStyle = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(1, drag.value / 150),
    transform: [{ translateY: off.value + Math.max(fullP.value, hideP.value, enter.value) * (sheetFull.value - off.value + 40) }],
  }));
  // насколько панель открыта: 0…1
  const openness = () => {
    'worklet';
    const m = sheetFull.value - sheetPeek.value;
    return m > 0 ? Math.min(1, Math.max(0, 1 - off.value / m)) : 1;
  };
  const bodyStyle = useAnimatedStyle(() => ({ opacity: Math.pow(openness(), 2) }));
  // ручка: открыто — ровная черта, свёрнуто — стрелка «вверх»
  const gripL = useAnimatedStyle(() => ({ transform: [{ rotate: `${-18 * (1 - openness())}deg` }] }));
  const gripR = useAnimatedStyle(() => ({ transform: [{ rotate: `${18 * (1 - openness())}deg` }] }));

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
  const t0 = taken.getTime();
  const others = nearby.filter((o) => o.id !== photo.id && Math.abs(new Date(o.taken_at).getTime() - t0) <= 15 * 60000);
  const people = Array.from(new Map(others.filter((o) => o.user_id !== photo.user_id).map((o) => [o.user_id, o])).values());
  const authors = people.slice(0, 4);
  const times = nearby.map((o) => new Date(o.taken_at).getTime());
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
      <StatusBar style="light" hidden={full || uiHidden} animated />
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.viewer, viewerStyle]} collapsable={false}>
          {/* Обычный вид: снимок над панелью автора */}
          <Animated.View style={[styles.cover, coverStyle]}>
            <Image
              source={photoSource(photo.storage_path)}
              style={styles.fill}
              contentFit={landscape ? 'contain' : 'cover'}
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
            {/* Затемнения как в макете: сверху — под кнопки, снизу — снимок перетекает в панель автора */}
            <Animated.View pointerEvents="none" style={[styles.shadeTopWrap, shadeStyle, landscape && { opacity: 0 }]}>
              <View style={styles.shadeTop} />
            </Animated.View>
            <Animated.View pointerEvents="none" style={[styles.burst, burstStyle]}>
              <Icon name="heartFill" size={96} color={D.sun} />
            </Animated.View>
          </Animated.View>
          {/* Полный экран: снимок целиком, можно приближать */}
          <Animated.View pointerEvents="none" style={[styles.fill, containStyle]}>
            <Image source={photoSource(photo.storage_path)} style={styles.fill} contentFit="contain" />
          </Animated.View>
        </Animated.View>
      </GestureDetector>

      <Animated.View
        style={[styles.topRow, landscape ? { top: 20, left: Math.max(16, insets.left), right: Math.max(16, insets.right) } : { top: insets.top + 8 }, chromeStyle]}
        pointerEvents={full || uiHidden ? 'none' : 'box-none'}
      >
        <RoundButton icon="back" tone="glass" label="Назад" onPress={() => router.back()} />
        {/* F1 · одна кнопка меню: поделиться, пожаловаться, скрыть автора */}
        <RoundButton icon="more" tone="glass" label="Меню" onPress={() => setMenu('actions')} />
      </Animated.View>

      {/* F6 · горизонтальный просмотр: автор строкой внизу */}
      {landscape && (
        <Animated.View pointerEvents="none" style={[styles.landBottom, landStyle]}>
          <View style={styles.landShadeTop} />
          <View style={styles.landShadeBottom} />
          <View style={[styles.landRow, { left: Math.max(16, insets.left), right: Math.max(16, insets.right) }]}>
            {photo.author_avatar ? <Image source={{ uri: photo.author_avatar }} style={styles.landAva} /> : <View style={[styles.landAva, { backgroundColor: D.sun }]} />}
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.landName} numberOfLines={1}>{photo.author_name || photo.author_username || 'Путешественник'}</Text>
              <Text style={styles.landStamp}>{stamp(taken)}</Text>
            </View>
            <View style={styles.like}>
              <Icon name={photo.liked_by_me ? 'heartFill' : 'heart'} size={20} color={photo.liked_by_me ? D.sun : D.paper} />
              <Text style={styles.likeCount}>{photo.like_count ?? 0}</Text>
            </View>
          </View>
        </Animated.View>
      )}

      {!landscape && (
      <Animated.View style={styles.sheetWrap} pointerEvents={full || uiHidden ? 'none' : 'box-none'}>
        <GestureDetector gesture={sheetPan}>
          <Animated.View style={sheetStyle} pointerEvents="box-none">
            {/* Над панелью: нижнее затемнение снимка и дата — едут вместе с панелью */}
            <View pointerEvents="none" style={styles.zone}>
              <View style={styles.shadeBottom} />
              <View style={styles.stamp}>
                <Text style={styles.stampText}>{stamp(taken)}</Text>
              </View>
            </View>
          <View
            style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}
            onLayout={(e) => {
              const h = e.nativeEvent.layout.height;
              const first = sheetFull.value === 0;
              sheetFull.value = h;
              if (first) enter.value = withSpring(0, SHEET_SPRING);
              if (sheetDragging.value) return; // пока панель держат пальцем — не трогаем
              if (openSV.value === 0) off.value = first ? Math.max(0, h - sheetPeek.value) : withTiming(Math.max(0, h - sheetPeek.value));
              else if (off.value > 0.5) off.value = withSpring(0, SHEET_SPRING); // открыта — значит до конца
            }}
          >
            {/* Шапка: видна всегда */}
            <View
              onLayout={(e) => {
                const peek = e.nativeEvent.layout.y + e.nativeEvent.layout.height + insets.bottom + 12;
                sheetPeek.value = peek;
                imgBottom.value = peek - 28;
                if (openSV.value === 0 && sheetFull.value && !sheetDragging.value) off.value = Math.max(0, sheetFull.value - peek);
              }}
            >
              <Pressable onPress={toggleSheet} style={styles.grip} hitSlop={{ top: 10, bottom: 6 }} accessibilityRole="button" accessibilityLabel={open ? 'Свернуть подробности' : 'Показать подробности'}>
                <Animated.View style={[styles.gripHalf, { marginRight: -1.5 }, gripL]} />
                <Animated.View style={[styles.gripHalf, { marginLeft: -1.5 }, gripR]} />
              </Pressable>
              <View style={styles.authorRow}>
                {photo.author_avatar ? <Image source={{ uri: photo.author_avatar }} style={styles.avatar} /> : <View style={[styles.avatar, { backgroundColor: D.sun }]} />}
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.author} numberOfLines={1}>{photo.author_name || photo.author_username || 'Путешественник'}</Text>
                  <Text style={styles.sub} numberOfLines={1}>
                    снял в {pad(taken.getHours())}:{pad(taken.getMinutes())} · {ago(taken)}
                  </Text>
                </View>
                <Pressable onPress={() => toggleLike()} hitSlop={10} style={styles.like} accessibilityLabel={photo.liked_by_me ? 'Убрать лайк' : 'Лайк'}>
                  <Animated.View style={heartStyle}>
                    <Icon name={photo.liked_by_me ? 'heartFill' : 'heart'} size={20} color={photo.liked_by_me ? D.sun : D.paper} />
                  </Animated.View>
                  <Text style={styles.likeCount}>{photo.like_count ?? 0}</Text>
                </Pressable>
              </View>
              {photo.place_name ? (
                <View style={styles.placeRow}>
                  <Icon name="pin" size={16} color={D.sun} />
                  <Text style={styles.place} numberOfLines={1}>{photo.place_name}</Text>
                </View>
              ) : null}
            </View>

            {/* Подробности: прячутся под ручку */}
            <Animated.View style={bodyStyle} pointerEvents={open ? 'auto' : 'none'}>
              {photo.caption ? <Text style={styles.caption}>{photo.caption}</Text> : null}
              {nearbyLoaded && people.length === 0 && (
                <Animated.View entering={FadeIn.duration(250)} style={styles.who}>
                  <View style={{ flex: 1, gap: 3, paddingLeft: 6 }}>
                    <Text style={styles.whoTitle} numberOfLines={1}>Пока вы здесь один</Text>
                    <Text style={styles.whoSub}>±15 минут больше никто не снимал</Text>
                  </View>
                </Animated.View>
              )}
              {people.length > 0 && (
                <Animated.View entering={FadeIn.duration(250)}>
                  <Pressable onPress={openWhoElse} style={({ pressed }) => [styles.who, pressed && { opacity: 0.85 }]}>
                    <View style={styles.avas}>
                      {authors.map((o, k) =>
                        o.author_avatar ? (
                          <Image key={o.user_id} source={{ uri: o.author_avatar }} style={[styles.whoAva, { marginLeft: k ? -8 : 0, zIndex: 10 - k }]} />
                        ) : (
                          <View key={o.user_id} style={[styles.whoAva, { marginLeft: k ? -8 : 0, zIndex: 10 - k, backgroundColor: D.sun }]} />
                        ),
                      )}
                    </View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={styles.whoTitle} numberOfLines={1}>
                        Ещё {people.length} {plural(people.length, 'человек', 'человека', 'человек')}
                      </Text>
                      <Text style={styles.whoSub}>были здесь ±15 минут</Text>
                    </View>
                    <View style={styles.go}>
                      <Icon name="arrow" size={18} color={D.white} />
                    </View>
                  </Pressable>
                </Animated.View>
              )}
              <View style={styles.strip}>
                <MomentStrip taken={taken} times={times} onPress={openWhoElse} />
              </View>
            </Animated.View>
          </View>
          </Animated.View>
        </GestureDetector>
      </Animated.View>

      )}

      {/* Меню ⋯ — F2 / F3 / F4 */}
      {menu && (
        <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenu(null)} />
          <Animated.View entering={SlideInDown.springify().damping(SHEET_SPRING.damping).stiffness(SHEET_SPRING.stiffness).mass(SHEET_SPRING.mass)} exiting={SlideOutDown.duration(220)} style={[styles.menu, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.handle} />
            {menu === 'actions' ? (
              <>
                <MenuRow
                  icon="share"
                  label="Поделиться"
                  onPress={() => {
                    setMenu(null);
                    Share.share({ message: `Момент в DreamApp: ${photo.place_name ?? ''}, ${stamp(taken)}` });
                  }}
                />
                {!mine && <MenuRow icon="flag" label="Пожаловаться на фото" chevron onPress={() => setMenu('report')} />}
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
            <PillButton title="Отмена" kind="quiet" onPress={() => setMenu(null)} style={{ marginTop: 12, height: 54 }} />
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}

function MenuRow({ icon, label, danger, chevron, onPress }: { icon?: IconName; label: string; danger?: boolean; chevron?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.menuRow, pressed && { opacity: 0.6 }]}>
      {icon && <Icon name={icon} size={22} color={danger ? D.sun : D.ink} />}
      <Text style={[styles.menuText, danger && { color: D.sun }]}>{label}</Text>
      {chevron && <Icon name="chevR" size={14} color={D.ink60} />}
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
  shadeTopWrap: { position: 'absolute', left: 0, right: 0, top: 0, height: 140 },
  shadeTop: {
    position: 'absolute', left: 0, right: 0, top: 0, height: 140,
    experimental_backgroundImage: 'linear-gradient(180deg, rgba(15,14,12,0.7) 0%, rgba(15,14,12,0) 100%)',
  },
  // 160 px градиента до края панели + 28 px, которые уходят под её скругление
  shadeBottom: {
    position: 'absolute', left: 0, right: 0, top: 0, height: 188,
    experimental_backgroundImage: 'linear-gradient(180deg, rgba(15,14,12,0) 0%, rgba(15,14,12,0.9) 85%, rgba(15,14,12,0.9) 100%)',
  },
  burst: { position: 'absolute', alignSelf: 'center', top: '40%' },
  imgState: { position: 'absolute', alignSelf: 'center', top: '42%', alignItems: 'center', gap: 8 },
  imgErr: { fontFamily: F.sans, fontSize: 14, color: D.paper, opacity: 0.7 },
  stamp: { position: 'absolute', left: 16, bottom: 6, backgroundColor: 'rgba(15,14,12,0.55)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  stampText: { fontFamily: F.mono, fontSize: 11, color: D.paper, letterSpacing: 0.6 },
  topRow: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', zIndex: 10 },
  zone: { height: 160 }, // 160 px градиента над панелью (+28 уходят под её скругление)
  sheet: { backgroundColor: D.night2, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20 },
  grip: { height: 28, flexDirection: 'row', justifyContent: 'center', paddingTop: 10 },
  gripHalf: { width: 19.5, height: 4, borderRadius: 2, backgroundColor: 'rgba(244,239,230,0.2)' },
  strip: { marginTop: 18 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  author: { fontFamily: F.sansSemi, fontSize: 16, color: D.paper },
  sub: { fontFamily: F.sans, fontSize: 13, color: 'rgba(244,239,230,0.55)' },
  like: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 4 },
  likeCount: { fontFamily: F.sansMedium, fontSize: 14, color: D.paper },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  place: { flex: 1, fontFamily: F.sans, fontSize: 14, color: 'rgba(244,239,230,0.85)' },
  caption: { fontFamily: F.sans, fontSize: 15, lineHeight: 22, color: D.paper, marginTop: 10 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: D.night3, borderRadius: 20, height: 74, paddingHorizontal: 14, marginTop: 16 },
  avas: { flexDirection: 'row' },
  whoAva: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: D.night3, margin: -2 },
  whoTitle: { fontFamily: F.sansSemi, fontSize: 15, color: D.paper },
  whoSub: { fontFamily: F.sans, fontSize: 13, color: 'rgba(244,239,230,0.55)' },
  go: { width: 36, height: 36, borderRadius: 18, backgroundColor: D.sun, alignItems: 'center', justifyContent: 'center' },
  goneIcon: { width: 96, height: 96, borderRadius: 48, backgroundColor: 'rgba(244,239,230,0.08)', alignItems: 'center', justifyContent: 'center' },
  goneTitle: { fontFamily: F.serif, fontSize: 28, color: D.paper, marginTop: 24, textAlign: 'center' },
  goneText: { fontFamily: F.sans, fontSize: 15, lineHeight: 22, color: D.paper, opacity: 0.6, marginTop: 10, textAlign: 'center' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,14,12,0.55)', justifyContent: 'flex-end' },
  menu: { backgroundColor: D.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 10 },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: D.line, marginBottom: 16 },
  menuTitle: { fontFamily: F.serif, fontSize: 24, color: D.ink, marginBottom: 8 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 15 },
  menuText: { flex: 1, fontFamily: F.sans, fontSize: 17, color: D.ink },
  landBottom: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  landShadeTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 90, experimental_backgroundImage: 'linear-gradient(180deg, rgba(22,19,15,0.6) 0%, rgba(22,19,15,0) 100%)' },
  landShadeBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 120, experimental_backgroundImage: 'linear-gradient(180deg, rgba(22,19,15,0) 0%, rgba(22,19,15,0.75) 100%)' },
  landRow: { position: 'absolute', bottom: 24, flexDirection: 'row', alignItems: 'center', gap: 10 },
  landAva: { width: 32, height: 32, borderRadius: 16 },
  landName: { fontFamily: F.sansSemi, fontSize: 15, color: D.paper },
  landStamp: { fontFamily: F.mono, fontSize: 11, color: 'rgba(244,239,230,0.75)' },
});
