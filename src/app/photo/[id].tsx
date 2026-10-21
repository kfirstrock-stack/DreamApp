// B6 · Фото во весь экран (утверждено 13.10, путь А): кадр на тёмном фоне, свайп вверх/вниз — соседние кадры
// того же списка (лента момента, профиль, точка на карте). Подробности — шторка снизу: всегда видна полоска
// «Подробности · ещё N человек рядом», потянуть или тапнуть — выезжает всё, что было на прежнем B6.
// Тап по кадру — спрятать интерфейс; двойной тап или щипок — снимок целиком с приближением; ⋯ — меню B7.
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, Share, StyleSheet, Text, View, useWindowDimensions, type ViewToken } from 'react-native';
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
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/components/Icon';
import { MomentStrip, stripRange } from '@/components/photo/MomentStrip';
import { PillButton } from '@/components/ui/PillButton';
import { RoundButton } from '@/components/ui/RoundButton';
import { SheetGrab } from '@/components/ui/SheetGrab';
import { useAuth } from '@/lib/auth';
import { D, F, SHEET_SPRING, STEP_MIN } from '@/lib/design';
import { ago, feedList } from '@/lib/feed';
import {
  boundsAround, cachedPhoto, deletePhoto, fetchPhotoFull, fetchPhotosV2, hideAuthor, photoSource, reportPhoto, setLike, setPhotoPrivate, type ReportReason,
} from '@/lib/photos';
import type { Photo } from '@/lib/types';

const pad = (n: number) => String(n).padStart(2, '0');
const MON = ['ЯНВ', 'ФЕВ', 'МАР', 'АПР', 'МАЯ', 'ИЮН', 'ИЮЛ', 'АВГ', 'СЕН', 'ОКТ', 'НОЯ', 'ДЕК'];
const stamp = (d: Date) => `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()} · ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const byTime = (a: Photo, b: Photo) => +new Date(a.taken_at) - +new Date(b.taken_at);
const VIEWABILITY = { itemVisiblePercentThreshold: 60 };
type Ctl = { current: { open: (o: boolean) => void } | null };

// Снимок двигается плавно, без пружины (пружина — только у шторок)
const SMOOTH = { duration: 320, easing: Easing.out(Easing.cubic) };

const REASONS: { key: ReportReason; label: string }[] = [
  { key: 'face_without_consent', label: 'На фото я, без моего согласия' },
  { key: 'inappropriate', label: 'Неприемлемое содержание' },
  { key: 'spam', label: 'Спам или реклама' },
  { key: 'wrong_place_or_time', label: 'Не то место или время' },
  { key: 'other', label: 'Другое' },
];

export default function PhotoScreen() {
  const { id, ctx } = useLocalSearchParams<{ id: string; ctx?: string }>();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const { session } = useAuth();
  const uid = session?.user.id ?? null;

  // Список кадров для листания: из экрана, откуда пришли; иначе — снимки этой точки за ±15 минут
  const [list, setList] = useState<Photo[]>(() => {
    const l = feedList(ctx);
    if (l?.some((p) => p.id === id)) return l;
    const c = cachedPhoto(id);
    return c ? [c] : [];
  });
  const [index, setIndex] = useState(() => Math.max(0, list.findIndex((p) => p.id === id)));
  const [listKey, setListKey] = useState(0); // новый список — заново прокрутить к текущему кадру
  const [failed, setFailed] = useState<null | 'gone' | 'error'>(null);
  const [attempt, setAttempt] = useState(0);
  const cur: Photo | undefined = list[index];

  useEffect(() => {
    const fromScreen = (feedList(ctx)?.length ?? 0) > 1;
    let off = false;
    setFailed(null);
    fetchPhotoFull(id, uid)
      .then(async (p) => {
        if (off) return;
        if (!p) return setFailed('gone');
        if (fromScreen) return patch(p);
        // соседние кадры той же точки ±15 минут
        const t = new Date(p.taken_at).getTime();
        const near = await fetchPhotosV2(boundsAround(p.lat, p.lng, 100), new Date(t - 15 * 60000), new Date(t + 15 * 60000), 200).catch(() => [] as Photo[]);
        if (off) return;
        const all = [p, ...near.filter((o) => o.id !== p.id)].sort(byTime);
        setList(all);
        setIndex(all.findIndex((o) => o.id === p.id));
        setListKey((k) => k + 1);
      })
      .catch(() => !off && setFailed(cachedPhoto(id) ? null : 'error')); // есть копия из ленты — показываем её
    return () => {
      off = true;
    };
  }, [id, uid, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = useCallback((p: Photo) => setList((l) => l.map((o) => (o.id === p.id ? { ...o, ...p } : o))), []);

  // Подробный снимок (лайк, автор) — для текущего кадра, когда на него перелистнули
  const fresh = useRef(new Set<string>([id]));
  useEffect(() => {
    if (!cur || fresh.current.has(cur.id)) return;
    fresh.current.add(cur.id);
    fetchPhotoFull(cur.id, uid).then((p) => p && patch(p)).catch(() => {});
  }, [cur?.id, uid, patch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Кто ещё снимал это место вокруг текущего кадра — для «+N», полоски и гистограммы
  const [nearby, setNearby] = useState<{ id: string; list: Photo[] } | null>(null);
  useEffect(() => {
    if (!cur) return;
    const t = new Date(cur.taken_at);
    const r = stripRange(t);
    const from = new Date(Math.min(r.from.getTime(), t.getTime() - 15 * 60000));
    const to = new Date(Math.max(r.to.getTime(), t.getTime() + 15 * 60000));
    let off = false;
    const timer = setTimeout(() => {
      fetchPhotosV2(boundsAround(cur.lat, cur.lng, 100), from, to, 300)
        .then((l) => !off && setNearby({ id: cur.id, list: l }))
        .catch(() => {});
    }, 150); // быстро листают — не грузим каждый промелькнувший кадр
    return () => {
      off = true;
      clearTimeout(timer);
    };
  }, [cur?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const near = nearby && cur && nearby.id === cur.id ? nearby.list : null;
  const people = useMemo(() => {
    if (!near || !cur) return null;
    const t0 = new Date(cur.taken_at).getTime();
    const others = near.filter((o) => o.id !== cur.id && o.user_id !== cur.user_id && Math.abs(new Date(o.taken_at).getTime() - t0) <= 15 * 60000);
    return Array.from(new Map(others.map((o) => [o.user_id, o])).values());
  }, [near, cur]);

  // Лайк: оптимистично
  const toggleLike = useCallback(
    async (p: Photo) => {
      if (!uid) return router.push('/sign-in');
      const on = !p.liked_by_me;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      patch({ ...p, liked_by_me: on, like_count: Math.max(0, (p.like_count ?? 0) + (on ? 1 : -1)) });
      try {
        await setLike(p.id, uid, on);
      } catch {
        patch(p);
      }
    },
    [uid, patch],
  );

  // Интерфейс: тап по кадру прячет кнопки, подписи и полоску; ещё тап — возвращает
  const [uiHidden, setUiHidden] = useState(false);
  const hideP = useSharedValue(0);
  const setUi = useCallback(
    (hide: boolean) => {
      setUiHidden(hide);
      hideP.value = hide ? withTiming(1, { duration: 450, easing: Easing.inOut(Easing.cubic) }) : withSpring(0, { damping: 16, stiffness: 180, mass: 0.8 });
    },
    [hideP],
  );

  // Шторка подробностей
  const [sheetOpen, setSheetOpenState] = useState(false);
  const sheetRef: Ctl = useRef<{ open: (o: boolean) => void } | null>(null);
  const sheetP = useSharedValue(0); // шторка открыта — автор, подпись и кнопки справа уходят
  const setSheetOpen = useCallback(
    (o: boolean) => {
      setSheetOpenState(o);
      sheetP.value = withTiming(o ? 1 : 0, { duration: 220 });
    },
    [sheetP],
  );

  // Снимок целиком с приближением (двойной тап / щипок)
  const [full, setFull] = useState(false);
  const fullP = useSharedValue(0);
  const setFullMode = useCallback(
    (on: boolean) => {
      setFull(on);
      fullP.value = withTiming(on ? 1 : 0, { duration: 300, easing: Easing.out(Easing.cubic) });
    },
    [fullP],
  );

  const onTap = useCallback(() => {
    if (sheetOpen) return sheetRef.current?.open(false);
    setUi(!uiHidden);
  }, [sheetOpen, uiHidden, setUi]);

  const peekH = Math.max(insets.bottom, 16) + 30; // в макете 64 pt на iPhone с «чёлкой»
  const [menu, setMenu] = useState<null | 'actions' | 'report'>(null);

  const chromeStyle = useAnimatedStyle(() => {
    const k = Math.max(fullP.value, hideP.value);
    return { opacity: 1 - k, transform: [{ translateY: -k * (insets.top + 80) }] };
  });

  // 13.10: закрыть — свайп вправо из любого места (как «назад» в iOS) или свайп вниз на первом кадре
  const swipeX = useSharedValue(0);
  const goBack = useCallback(() => router.back(), []);
  const closePan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!sheetOpen && !full)
        .activeOffsetX(18)
        .failOffsetX(-18)
        .failOffsetY([-14, 14]) // вертикальное движение — листание кадров, не закрытие
        .onUpdate((e) => {
          swipeX.value = Math.max(0, e.translationX);
        })
        .onFinalize((e) => {
          if (swipeX.value > 110 || (e.velocityX > 800 && swipeX.value > 30)) {
            swipeX.value = withTiming(width, { duration: 200, easing: Easing.out(Easing.cubic) });
            scheduleOnRN(goBack);
          } else swipeX.value = withSpring(0, { damping: 18, stiffness: 220 });
        }),
    [sheetOpen, full, width, goBack], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const swipeStyle = useAnimatedStyle(() => {
    const k = Math.min(1, swipeX.value / width);
    return { opacity: 1 - k * 0.6, transform: [{ translateX: swipeX.value }, { scale: 1 - k * 0.08 }] };
  });

  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const v = viewableItems.find((x) => x.isViewable);
    if (v?.index != null) setIndex(v.index);
  }).current;

  if (failed === 'error' && !cur) {
    return (
      <View style={[styles.root, styles.center, { padding: 32 }]}>
        <Text style={styles.goneTitle}>Не удалось загрузить фото</Text>
        <Text style={styles.goneText}>Проверьте интернет и попробуйте ещё раз.</Text>
        <PillButton title="Повторить" onPress={() => setAttempt((a) => a + 1)} style={{ marginTop: 24, alignSelf: 'stretch' }} />
        <PillButton title="Назад" kind="quiet" onPress={() => router.back()} style={{ marginTop: 10, alignSelf: 'stretch' }} />
      </View>
    );
  }
  if ((failed === 'gone' && (!cur || cur.id === id)) || cur?.hidden) {
    return (
      // E4 · Фото недоступно (по макету): назад сверху, знак, заголовок, пояснение, «Вернуться к моменту» внизу
      <View style={[styles.root, { paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 16) + 64 }]}>
        <View style={{ paddingHorizontal: 16 }}>
          <RoundButton icon="back" tone="glass" label="Назад" onPress={() => router.back()} />
        </View>
        <View style={[styles.center, { flex: 1, paddingHorizontal: 32 }]}>
          <View style={styles.goneIcon}>
            <Icon name="eyeOff" size={40} color={D.paper} />
          </View>
          <Text style={styles.goneTitle}>Фото больше недоступно</Text>
          <Text style={styles.goneText}>Автор удалил его или оно скрыто после жалоб. Остальные снимки этого момента на месте.</Text>
        </View>
        <PillButton title="Вернуться к моменту" onPress={() => router.back()} style={{ marginHorizontal: 32 }} />
      </View>
    );
  }
  if (!cur) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={D.paper} />
      </View>
    );
  }

  const taken = new Date(cur.taken_at);
  const mine = uid === cur.user_id;
  const winStart = new Date(taken);
  winStart.setMinutes(Math.floor(taken.getMinutes() / STEP_MIN) * STEP_MIN, 0, 0);
  const winEnd = new Date(winStart.getTime() + STEP_MIN * 60000);
  const sub = `${winStart.getDate()} ${MON[winStart.getMonth()]} ${winStart.getFullYear()} · ${hm(winStart)}–${hm(winEnd)}${list.length > 1 ? ` · ${index + 1} ИЗ ${list.length}` : ''}`;

  const openWhoElse = () =>
    router.push({
      pathname: '/moment',
      params: { lat: String(cur.lat), lng: String(cur.lng), radius: '120', from: String(winStart.getTime()), title: cur.place_name ?? '' },
    });
  const openAuthor = (p: Photo) => router.push(uid === p.user_id ? '/profile' : { pathname: '/user/[id]', params: { id: p.user_id } });

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
  const removeCur = () => {
    const rest = list.filter((o) => o.id !== cur.id);
    if (!rest.length) return router.back();
    setList(rest);
    setIndex(Math.min(index, rest.length - 1));
    setListKey((k) => k + 1);
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" hidden={full || uiHidden} animated />
      <GestureDetector gesture={closePan}>
      <Animated.View style={[StyleSheet.absoluteFill, swipeStyle]}>
      <FlatList
        key={`${listKey}-${landscape ? 'l' : 'p'}`}
        data={list}
        keyExtractor={(p) => p.id}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        initialScrollIndex={index}
        getItemLayout={(_, i) => ({ length: height, offset: height * i, index: i })}
        windowSize={3}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        scrollEnabled={!sheetOpen && !full}
        onViewableItemsChanged={onViewable}
        onScrollEndDrag={(e) => {
          // на первом кадре потянули вниз — закрыть (iOS даёт оттянуть за край)
          if (index === 0 && e.nativeEvent.contentOffset.y < -70) router.back();
        }}
        viewabilityConfig={VIEWABILITY}
        renderItem={({ item, index: i }) => (
          <Page
            photo={item}
            active={i === index}
            width={width}
            height={height}
            landscape={landscape}
            people={i === index ? people : null}
            peekH={landscape ? Math.max(insets.bottom, 16) : peekH}
            insetsTop={insets.top}
            hideP={hideP}
            sheetP={sheetP}
            hidden={uiHidden || sheetOpen}
            onTap={onTap}
            onFull={() => setFullMode(true)}
            onLike={toggleLike}
            onAuthor={openAuthor}
            onDetails={() => sheetRef.current?.open(true)}
            onPeople={openWhoElse}
          />
        )}
      />

      {/* Шапка: назад, место и время, ⋯ — стоит на месте, кадры листаются под ней */}
      <Animated.View
        style={[styles.topRow, landscape ? { top: 16, left: Math.max(16, insets.left), right: Math.max(16, insets.right) } : { top: insets.top + 8 }, chromeStyle]}
        pointerEvents={full || uiHidden ? 'none' : 'box-none'}
      >
        <RoundButton icon="back" tone="glass" label="Назад" onPress={() => router.back()} />
        <View style={styles.head} pointerEvents="none">
          <Text style={styles.headTitle} numberOfLines={1}>
            {cur.place_name || 'Снимок'}
          </Text>
          <Text style={styles.headSub} numberOfLines={1}>
            {sub}
          </Text>
          {/* 13.10 · свой скрытый снимок — пометка «Только мне» */}
          {mine && cur.private ? (
            <View style={styles.privPill}>
              <Icon name="lock" size={14} color={D.white} />
              <Text style={styles.privText}>Только мне</Text>
            </View>
          ) : null}
        </View>
        {/* F1 · одна кнопка меню: поделиться, пожаловаться, скрыть автора */}
        <RoundButton icon="more" tone="glass" label="Меню" onPress={() => setMenu('actions')} />
      </Animated.View>

      {!landscape && (
        <DetailsSheet
          control={sheetRef}
          photo={cur}
          near={near}
          people={people}
          peekH={peekH}
          bottomInset={insets.bottom}
          hideP={hideP}
          fullP={fullP}
          hidden={uiHidden || full}
          onOpenChange={setSheetOpen}
          onLike={() => toggleLike(cur)}
          onAuthor={() => openAuthor(cur)}
          onWhoElse={openWhoElse}
        />
      )}

      </Animated.View>
      </GestureDetector>

      {full && <FullView photo={cur} width={width} height={height} fullP={fullP} onClose={() => setFullMode(false)} />}

      {/* Меню ⋯ — F2 / F3 / F4 */}
      {menu && (
        <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenu(null)} />
          <Animated.View
            entering={SlideInDown.springify().damping(SHEET_SPRING.damping).stiffness(SHEET_SPRING.stiffness).mass(SHEET_SPRING.mass)}
            exiting={SlideOutDown.duration(220)}
            style={[styles.menu, { paddingBottom: insets.bottom + 16 }]}
          >
            <SheetGrab />
            {menu === 'actions' ? (
              <>
                <MenuRow
                  icon="share"
                  label="Поделиться"
                  onPress={() => {
                    setMenu(null);
                    Share.share({ message: `Момент в DreamApp: ${cur.place_name ?? ''}, ${stamp(taken)}` });
                  }}
                />
                {mine && (
                  <MenuRow
                    icon="lock"
                    label={cur.private ? 'Сделать видимым всем' : 'Сделать «Только мне»'}
                    onPress={() => {
                      const on = !cur.private;
                      setMenu(null);
                      patch({ ...cur, private: on });
                      setPhotoPrivate(cur, on).then(
                        (storage_path) => patch({ ...cur, private: on, storage_path }),
                        (e) => {
                          patch({ ...cur, private: !on });
                          Alert.alert('Не получилось', e?.message ?? '');
                        },
                      );
                    }}
                  />
                )}
                {!mine && <MenuRow icon="flag" label="Пожаловаться на фото" chevron onPress={() => setMenu('report')} />}
                {!mine && (
                  <MenuRow
                    icon="eyeOff"
                    label="Скрыть фото этого автора"
                    onPress={() => act(() => hideAuthor(uid!, cur.user_id), 'Автор скрыт. Его фото больше не появятся у вас на карте.')}
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
                        {
                          text: 'Удалить',
                          style: 'destructive',
                          onPress: () =>
                            deletePhoto(cur)
                              .then(() => {
                                setMenu(null);
                                removeCur();
                              })
                              .catch((e) => Alert.alert('Не получилось', e?.message ?? '')),
                        },
                      ])
                    }
                  />
                )}
              </>
            ) : (
              <>
                <Text style={styles.menuTitle}>Что не так с фото?</Text>
                {REASONS.map((r) => (
                  <MenuRow key={r.key} label={r.label} onPress={() => act(() => reportPhoto(cur.id, uid!, r.key), 'Спасибо! Мы проверим фото.')} />
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

// ——— Один кадр ленты ———
type PageProps = {
  photo: Photo;
  active: boolean;
  width: number;
  height: number;
  landscape: boolean;
  people: Photo[] | null;
  peekH: number;
  insetsTop: number;
  hideP: SharedValue<number>;
  sheetP: SharedValue<number>;
  hidden: boolean;
  onTap: () => void;
  onFull: () => void;
  onLike: (p: Photo) => void;
  onAuthor: (p: Photo) => void;
  onDetails: () => void;
  onPeople: () => void;
};

const Page = memo(function Page(props: PageProps) {
  const { photo, width, height, landscape, people, peekH, hideP, sheetP, hidden } = props;
  const [img, setImg] = useState<'loading' | 'ok' | 'error'>('loading');
  const taken = new Date(photo.taken_at);
  const burst = useSharedValue(0);
  const heart = useSharedValue(1);
  const burstStyle = useAnimatedStyle(() => ({ opacity: burst.value, transform: [{ scale: 0.6 + burst.value * 0.6 }] }));
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: heart.value }] }));
  const overStyle = useAnimatedStyle(() => ({ opacity: 1 - Math.max(hideP.value, sheetP.value), transform: [{ translateY: hideP.value * 40 }] }));
  const topShade = useAnimatedStyle(() => ({ opacity: 1 - hideP.value }));

  const like = () => {
    heart.value = withSequence(withSpring(1.35, { damping: 6, stiffness: 400 }), withSpring(1, { damping: 10 }));
    if (!photo.liked_by_me) burst.value = withSequence(withTiming(1, { duration: 120 }), withTiming(0, { duration: 450 })); // сердце вспыхивает и на снимке
    props.onLike(photo);
  };

  const gesture = useMemo(() => {
    const single = Gesture.Tap().onEnd(() => scheduleOnRN(props.onTap));
    const double = Gesture.Tap()
      .numberOfTaps(2)
      .onEnd(() => scheduleOnRN(props.onFull));
    const pinch = Gesture.Pinch().onStart(() => scheduleOnRN(props.onFull));
    return Gesture.Race(pinch, Gesture.Exclusive(double, single));
  }, [props.onTap, props.onFull]); // eslint-disable-line react-hooks/exhaustive-deps

  const n = people?.length ?? 0;
  const ava = people?.[0]?.author_avatar;

  return (
    <View style={{ width, height, backgroundColor: D.night }}>
      <GestureDetector gesture={gesture}>
        <View style={StyleSheet.absoluteFill} collapsable={false}>
          <Image
            source={photoSource(photo.storage_path)}
            style={StyleSheet.absoluteFill}
            contentFit={landscape ? 'contain' : 'cover'}
            transition={{ duration: 300, effect: 'cross-dissolve' }}
            recyclingKey={photo.id}
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
          {/* затемнения как в макете: сверху — под кнопки, снизу — под автора и подпись */}
          <Animated.View pointerEvents="none" style={[styles.shadeTop, topShade]} />
          <View pointerEvents="none" style={[styles.shadeBottom, { height: landscape ? 140 : 420 }]} />
          <Animated.View pointerEvents="none" style={[styles.burst, burstStyle]}>
            <Icon name="heartFill" size={96} color={D.sun} />
          </Animated.View>
        </View>
      </GestureDetector>

      {/* Справа: лайк и «кто ещё был рядом» */}
      <Animated.View style={[styles.rail, { bottom: peekH + 140 }, overStyle]} pointerEvents={hidden ? 'none' : 'box-none'}>
        <Pressable onPress={like} hitSlop={8} style={styles.railItem} accessibilityLabel={photo.liked_by_me ? 'Убрать лайк' : 'Лайк'}>
          <Animated.View style={heartStyle}>
            <Icon name={photo.liked_by_me ? 'heartFill' : 'heart'} size={28} color={photo.liked_by_me ? D.sun : D.white} />
          </Animated.View>
          <Text style={styles.railText}>{photo.like_count ?? 0}</Text>
        </Pressable>
        {n > 0 && (
          <Animated.View entering={FadeIn.duration(200)}>
            <Pressable onPress={props.onPeople} style={styles.railItem} accessibilityLabel={`Ещё ${n} рядом — лента момента`}>
              {ava ? <Image source={{ uri: ava }} style={styles.railAva} /> : <View style={[styles.railAva, { backgroundColor: D.sun }]} />}
              <Text style={styles.railText}>+{n}</Text>
            </Pressable>
          </Animated.View>
        )}
      </Animated.View>

      {/* Внизу: автор и подпись */}
      <Animated.View style={[styles.info, { bottom: peekH + 20, right: landscape ? 120 : 83 }, overStyle]} pointerEvents={hidden ? 'none' : 'box-none'}>
        <Pressable onPress={() => props.onAuthor(photo)} style={styles.authorRow} hitSlop={{ top: 4, bottom: 4 }} accessibilityLabel="Профиль автора">
          {photo.author_avatar ? <Image source={{ uri: photo.author_avatar }} style={styles.ava} /> : <View style={[styles.ava, { backgroundColor: D.sun }]} />}
          <View style={{ flexShrink: 1, gap: 1 }}>
            <Text style={styles.author} numberOfLines={1}>
              {photo.author_name || photo.author_username || 'Путешественник'}
            </Text>
            <Text style={styles.sub} numberOfLines={1}>
              снял в {hm(taken)} · {ago(taken)}
            </Text>
          </View>
        </Pressable>
        {photo.caption ? (
          <Pressable onPress={props.onDetails} accessibilityLabel="Подробности">
            <Text style={styles.caption} numberOfLines={3}>
              {photo.caption}
            </Text>
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  );
});

// ——— Шторка подробностей: полоска внизу, тянуть или тапнуть — всё о снимке ———
type SheetProps = {
  control: Ctl;
  photo: Photo;
  near: Photo[] | null;
  people: Photo[] | null;
  peekH: number;
  bottomInset: number;
  hideP: SharedValue<number>;
  fullP: SharedValue<number>;
  hidden: boolean;
  onOpenChange: (o: boolean) => void;
  onLike: () => void;
  onAuthor: () => void;
  onWhoElse: () => void;
};

function DetailsSheet(props: SheetProps) {
  const { photo, near, people, peekH, bottomInset, hideP, fullP, hidden, control } = props;
  // 13.10 (№ «слои накладываются»): открытость шторки храним сама по себе — 0 свёрнута, 1 открыта.
  // Раньше её вычисляли из высоты, и при смене кадра она «застревала» посередине: дата и автор просвечивали
  const sheetH = useSharedValue(0);
  const prog = useSharedValue(0);
  const enter = useSharedValue(1); // появление полоски снизу при открытии экрана
  const start = useSharedValue(0);
  const dragging = useSharedValue(0);
  const openSV = useSharedValue(0);
  const [open, setOpenState] = useState(false);

  const report = useCallback(
    (o: boolean) => {
      setOpenState(o);
      props.onOpenChange(o);
      Haptics.selectionAsync().catch(() => {});
    },
    [props.onOpenChange], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const setOpen = useCallback(
    (o: boolean) => {
      if ((openSV.value === 1) === o) return;
      openSV.value = o ? 1 : 0;
      prog.value = withSpring(o ? 1 : 0, SHEET_SPRING);
      report(o);
    },
    [openSV, prog, report],
  );
  useEffect(() => {
    control.current = { open: setOpen };
  }, [control, setOpen]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-8, 8])
        .failOffsetX([-20, 20])
        .onStart(() => {
          start.value = prog.value;
          dragging.value = 1;
        })
        .onUpdate((e) => {
          const m = Math.max(1, sheetH.value - peekH);
          let v = start.value - e.translationY / m;
          if (v > 1) v = 1 + (v - 1) * 0.25; // резинка за краями
          if (v < 0) v *= 0.25;
          prog.value = v;
        })
        // onFinalize, а не onEnd: срабатывает и когда жест прерван (иначе шторка застревала на полпути)
        .onFinalize((e) => {
          if (!dragging.value) return;
          dragging.value = 0;
          const m = Math.max(1, sheetH.value - peekH);
          const o = e.velocityY < -400 ? true : e.velocityY > 400 ? false : prog.value > 0.5;
          const changed = (openSV.value === 1) !== o;
          openSV.value = o ? 1 : 0;
          prog.value = withSpring(o ? 1 : 0, { ...SHEET_SPRING, velocity: -e.velocityY / m });
          if (changed) scheduleOnRN(report, o);
        }),
    [peekH], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const openness = () => {
    'worklet';
    return Math.min(1, Math.max(0, prog.value));
  };
  const sheetStyle = useAnimatedStyle(() => {
    const m = Math.max(0, sheetH.value - peekH);
    const away = Math.max(hideP.value, fullP.value, enter.value);
    return {
      opacity: sheetH.value > 0 ? 1 : 0, // пока не знаем высоту — не показываем
      transform: [{ translateY: (1 - prog.value) * m + away * (peekH + 20) }],
    };
  });
  const peekStyle = useAnimatedStyle(() => ({ opacity: 1 - Math.min(1, openness() * 2.5) }));
  const bodyStyle = useAnimatedStyle(() => ({ opacity: Math.pow(openness(), 2) }));
  const stampStyle = useAnimatedStyle(() => ({ opacity: Math.max(0, openness() * 2 - 1) }));

  const taken = new Date(photo.taken_at);
  const n = people?.length ?? 0;
  const authors = (people ?? []).slice(0, 4);
  const times = (near ?? []).map((o) => new Date(o.taken_at).getTime());
  const peekText = people == null ? 'Подробности' : n > 0 ? `Подробности · ещё ${n} ${plural(n, 'человек', 'человека', 'человек')} рядом` : 'Подробности · рядом никого';

  return (
    <View style={styles.sheetWrap} pointerEvents={hidden ? 'none' : 'box-none'}>
      <GestureDetector gesture={pan}>
        <Animated.View style={sheetStyle}>
          {/* дата над шторкой — видна, когда шторка открыта (как на прежнем B6) */}
          <Animated.View pointerEvents="none" style={[styles.stamp, stampStyle]}>
            <Text style={styles.stampText}>{stamp(taken)}</Text>
          </Animated.View>
          <View
            style={[styles.sheet, { paddingBottom: bottomInset + 12 }]}
            onLayout={(e) => {
              const first = sheetH.value === 0;
              sheetH.value = e.nativeEvent.layout.height;
              if (first) enter.value = withSpring(0, SHEET_SPRING);
            }}
          >
            <View style={styles.grip}>
              <SheetGrab tone="dark" />
            </View>
            {/* полоска «Подробности»: видна в свёрнутом виде; тап — открыть */}
            <Animated.View style={[styles.peek, peekStyle]} pointerEvents={open ? 'none' : 'auto'}>
              <Pressable onPress={() => setOpen(true)} style={styles.peekHit} accessibilityRole="button" accessibilityLabel={peekText}>
                <Text style={styles.peekText} numberOfLines={1}>
                  {peekText}
                </Text>
              </Pressable>
            </Animated.View>

            <Animated.View style={bodyStyle} pointerEvents={open ? 'auto' : 'none'}>
              <View style={styles.sAuthorRow}>
                {/* автор → D3 (свой — D1) */}
                <Pressable onPress={props.onAuthor} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }} accessibilityLabel="Профиль автора">
                  {photo.author_avatar ? <Image source={{ uri: photo.author_avatar }} style={styles.sAvatar} /> : <View style={[styles.sAvatar, { backgroundColor: D.sun }]} />}
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={styles.sAuthor} numberOfLines={1}>
                      {photo.author_name || photo.author_username || 'Путешественник'}
                    </Text>
                    <Text style={styles.sSub} numberOfLines={1}>
                      снял в {hm(taken)} · {ago(taken)}
                    </Text>
                  </View>
                </Pressable>
                <Pressable onPress={props.onLike} hitSlop={10} style={styles.sLike} accessibilityLabel={photo.liked_by_me ? 'Убрать лайк' : 'Лайк'}>
                  <Icon name={photo.liked_by_me ? 'heartFill' : 'heart'} size={20} color={photo.liked_by_me ? D.sun : D.paper} />
                  <Text style={styles.sLikeCount}>{photo.like_count ?? 0}</Text>
                </Pressable>
              </View>
              {photo.place_name ? (
                <View style={styles.placeRow}>
                  <Icon name="pin" size={16} color={D.sun} />
                  <Text style={styles.place} numberOfLines={1}>
                    {photo.place_name}
                  </Text>
                </View>
              ) : null}
              {photo.caption ? <Text style={styles.sCaption}>{photo.caption}</Text> : null}
              {people && n === 0 && (
                <View style={styles.who}>
                  <View style={{ flex: 1, gap: 3, paddingLeft: 6 }}>
                    <Text style={styles.whoTitle} numberOfLines={1}>
                      Пока вы здесь один
                    </Text>
                    <Text style={styles.whoSub}>±15 минут больше никто не снимал</Text>
                  </View>
                </View>
              )}
              {n > 0 && (
                <Pressable onPress={props.onWhoElse} style={({ pressed }) => [styles.who, pressed && { opacity: 0.85 }]}>
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
                      Ещё {n} {plural(n, 'человек', 'человека', 'человек')}
                    </Text>
                    <Text style={styles.whoSub}>были здесь ±15 минут</Text>
                  </View>
                  <View style={styles.go}>
                    <Icon name="arrow" size={18} color={D.white} />
                  </View>
                </Pressable>
              )}
              <View style={styles.strip}>
                <MomentStrip taken={taken} times={times} onPress={props.onWhoElse} />
              </View>
            </Animated.View>
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

// ——— Снимок целиком: щипок и двойной тап — приближение, тап — назад к ленте ———
function FullView({ photo, width, height, fullP, onClose }: { photo: Photo; width: number; height: number; fullP: SharedValue<number>; onClose: () => void }) {
  const scale = useSharedValue(1);
  const saved = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const stx = useSharedValue(0);
  const sty = useSharedValue(0);
  const close = useCallback(() => {
    fullP.value = withTiming(0, { duration: 250 });
    setTimeout(onClose, 250);
  }, [fullP, onClose]);

  const gesture = useMemo(() => {
    const reset = () => {
      'worklet';
      scale.value = withTiming(1, SMOOTH);
      tx.value = withTiming(0, SMOOTH);
      ty.value = withTiming(0, SMOOTH);
      saved.value = 1;
      stx.value = 0;
      sty.value = 0;
    };
    const single = Gesture.Tap().onEnd(() => scheduleOnRN(close));
    const double = Gesture.Tap()
      .numberOfTaps(2)
      .onEnd((e) => {
        if (scale.value > 1.05) return reset();
        const k = 2.5; // приближаем к точке касания
        const nx = (width / 2 - e.x) * (k - 1);
        const ny = (height / 2 - e.y) * (k - 1);
        scale.value = withTiming(k, SMOOTH);
        tx.value = withTiming(nx, SMOOTH);
        ty.value = withTiming(ny, SMOOTH);
        saved.value = k;
        stx.value = nx;
        sty.value = ny;
      });
    const pinch = Gesture.Pinch()
      .onUpdate((e) => {
        scale.value = Math.min(5, Math.max(0.8, saved.value * e.scale));
      })
      .onEnd(() => {
        if (scale.value < 1) reset();
        else saved.value = scale.value;
      });
    const pan = Gesture.Pan()
      .minPointers(1)
      .onUpdate((e) => {
        if (saved.value <= 1.05) return;
        tx.value = stx.value + e.translationX;
        ty.value = sty.value + e.translationY;
      })
      .onEnd(() => {
        // не даём увести снимок за края
        const mx = (width * (scale.value - 1)) / 2;
        const my = (height * (scale.value - 1)) / 2;
        const cx = Math.min(mx, Math.max(-mx, tx.value));
        const cy = Math.min(my, Math.max(-my, ty.value));
        tx.value = withTiming(cx, SMOOTH);
        ty.value = withTiming(cy, SMOOTH);
        stx.value = cx;
        sty.value = cy;
      });
    return Gesture.Race(Gesture.Simultaneous(pinch, pan), Gesture.Exclusive(double, single));
  }, [width, height, close]); // eslint-disable-line react-hooks/exhaustive-deps

  const bg = useAnimatedStyle(() => ({ opacity: fullP.value }));
  const imgStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }] }));
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: D.night }, bg]}>
        <Animated.View style={[StyleSheet.absoluteFill, imgStyle]}>
          <Image source={photoSource(photo.storage_path)} style={StyleSheet.absoluteFill} contentFit="contain" />
        </Animated.View>
      </Animated.View>
    </GestureDetector>
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
  const m10 = n % 10,
    m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: D.night },
  center: { alignItems: 'center', justifyContent: 'center' },
  shadeTop: {
    position: 'absolute', left: 0, right: 0, top: 0, height: 140,
    experimental_backgroundImage: 'linear-gradient(180deg, rgba(15,14,12,0.7) 0%, rgba(15,14,12,0) 100%)',
  },
  shadeBottom: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    experimental_backgroundImage: 'linear-gradient(180deg, rgba(15,14,12,0) 0%, rgba(15,14,12,0.85) 100%)',
  },
  burst: { position: 'absolute', alignSelf: 'center', top: '40%' },
  imgState: { position: 'absolute', alignSelf: 'center', top: '42%', alignItems: 'center', gap: 8 },
  imgErr: { fontFamily: F.sans, fontSize: 14, color: D.paper, opacity: 0.7 },
  topRow: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 12, zIndex: 10 },
  head: { flex: 1, paddingTop: 4, gap: 2 },
  headTitle: { fontFamily: F.sansSemi, fontSize: 16, color: D.white },
  privPill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 8, paddingLeft: 10, paddingRight: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(15,14,12,0.45)' },
  privText: { fontFamily: F.sansSemi, fontSize: 12, color: D.white },
  headSub: { fontFamily: F.monoRegular, fontSize: 11, letterSpacing: 0.44, color: 'rgba(255,255,255,0.75)' },
  rail: { position: 'absolute', right: 16, width: 44, alignItems: 'center', gap: 22 },
  railItem: { alignItems: 'center', gap: 4, minWidth: 44, minHeight: 44 },
  railText: { fontFamily: F.sansSemi, fontSize: 12, color: D.white },
  railAva: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: D.white },
  info: { position: 'absolute', left: 20, gap: 10 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'flex-start' },
  ava: { width: 36, height: 36, borderRadius: 18 },
  author: { fontFamily: F.sansSemi, fontSize: 15, color: D.white },
  sub: { fontFamily: F.sans, fontSize: 12, color: 'rgba(255,255,255,0.75)' },
  caption: { fontFamily: F.sans, fontSize: 14, lineHeight: 20, color: D.white },
  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  stamp: { position: 'absolute', left: 16, top: -36, backgroundColor: 'rgba(15,14,12,0.55)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  stampText: { fontFamily: F.mono, fontSize: 11, color: D.paper, letterSpacing: 0.6 },
  sheet: { backgroundColor: D.night2, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20 },
  grip: { height: 28, paddingTop: 10 },
  peek: { position: 'absolute', left: 0, right: 0, top: 0 },
  peekHit: { height: 64, paddingTop: 26, alignItems: 'center' },
  peekText: { fontFamily: F.sansSemi, fontSize: 13, color: 'rgba(255,255,255,0.75)' },
  strip: { marginTop: 18 },
  sAuthorRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sAvatar: { width: 44, height: 44, borderRadius: 22 },
  sAuthor: { fontFamily: F.sansSemi, fontSize: 16, color: D.paper },
  sSub: { fontFamily: F.sans, fontSize: 13, color: 'rgba(244,239,230,0.55)' },
  sLike: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 4 },
  sLikeCount: { fontFamily: F.sansMedium, fontSize: 14, color: D.paper },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  place: { flex: 1, fontFamily: F.sans, fontSize: 14, color: 'rgba(244,239,230,0.85)' },
  sCaption: { fontFamily: F.sans, fontSize: 15, lineHeight: 22, color: D.paper, marginTop: 10 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: D.night3, borderRadius: 20, height: 74, paddingHorizontal: 14, marginTop: 16 },
  avas: { flexDirection: 'row' },
  whoAva: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: D.night3, margin: -2 },
  whoTitle: { fontFamily: F.sansSemi, fontSize: 15, color: D.paper },
  whoSub: { fontFamily: F.sans, fontSize: 13, color: 'rgba(244,239,230,0.55)' },
  go: { width: 36, height: 36, borderRadius: 18, backgroundColor: D.sun, alignItems: 'center', justifyContent: 'center' },
  goneIcon: { width: 96, height: 96, borderRadius: 48, backgroundColor: 'rgba(244,239,230,0.08)', alignItems: 'center', justifyContent: 'center' },
  goneTitle: { fontFamily: F.serif, fontSize: 30, color: D.paper, marginTop: 28, textAlign: 'center' },
  goneText: { fontFamily: F.sans, fontSize: 15, lineHeight: 22, color: D.paper, opacity: 0.6, marginTop: 8, textAlign: 'center' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,14,12,0.55)', justifyContent: 'flex-end' },
  menu: { backgroundColor: D.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 10 },
  menuTitle: { fontFamily: F.serif, fontSize: 24, color: D.ink, marginBottom: 8 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 15 },
  menuText: { flex: 1, fontFamily: F.sans, fontSize: 17, color: D.ink },
});
