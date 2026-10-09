import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import MapView from 'react-native-maps';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition, SlideInDown, SlideOutDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { HALO, MomentLayer, PIN, type Pin } from '@/components/map/MomentLayer';
import { StackFan } from '@/components/map/StackFan';
import { RollingTime } from '@/components/time/RollingTime';
import { DateSheet } from '@/components/time/DateSheet';
import { ScaleGrip, type ScaleMode } from '@/components/time/ScaleGrip';
import { TimeScrubber } from '@/components/time/TimeScrubber';
import { PillButton } from '@/components/ui/PillButton';
import { RoundButton } from '@/components/ui/RoundButton';
import { TAB_BAR_SPACE, TabBar } from '@/components/ui/TabBar';
import { useAuth } from '@/lib/auth';
import { D, F, SHEET_SPRING, STEP_MIN, softShadow } from '@/lib/design';
import { consumeMapFocus } from '@/lib/focus';
import { project, regionBounds, regionRadiusM, type MapRegion } from '@/lib/geo';
import { fetchLatestIn, fetchPhotosV2 } from '@/lib/photos';
import {
  STEPS, bigLabel, bucketCount, bucketIndex, bucketStart, clock, emptyRangeTitle, isCurrentRange, momentSuffix, position,
  rangeEnd, rangeLabel, rangeStart, shiftRange, ticks, untilLabel, type Step,
} from '@/lib/timeSteps';
import type { Photo } from '@/lib/types';

// Выбор шага шкалы и вида карты помним, пока приложение открыто
let stepPref: Step = '15m';
let scaleModePref: ScaleMode = 'full';
let nudged = false; // «кивок» ручки — один раз за запуск
// Кэш снимков по диапазону и области: при смене шага/дня показываем сразу, обновляем в фоне
const photoCache = new Map<string, Photo[]>();
const cacheKey = (step: Step, start: Date, r: MapRegion) =>
  `${step}|${start.getTime()}|${r.latitude.toFixed(3)}|${r.longitude.toFixed(3)}|${r.latitudeDelta.toFixed(3)}`;
// Места, которые уже встречались на карте: название в поиске есть, даже когда в выбранный день пусто
const knownPlaces = new Map<string, { lat: number; lng: number; name: string }>();
const loadRange = async (step: Step, start: Date, r: MapRegion) => {
  const limit = step === 'week' ? 3000 : step === 'day' ? 2000 : 800;
  const list = await fetchPhotosV2(regionBounds(r, 1.6), start, rangeEnd(step, start), limit);
  photoCache.set(cacheKey(step, start, r), list);
  for (const p of list) if (p.place_name) knownPlaces.set(`${p.lat.toFixed(4)},${p.lng.toFixed(4)}`, { lat: p.lat, lng: p.lng, name: p.place_name });
  return list;
};
type MapStyle = 'warm' | 'satellite' | 'night';
let mapStylePref: MapStyle = 'warm';
const MAP_STYLES: { key: MapStyle; label: string; color: string }[] = [
  { key: 'warm', label: 'Тёплая', color: '#ECE5D8' },
  { key: 'satellite', label: 'Спутник', color: '#51614D' },
  { key: 'night', label: 'Ночная', color: '#1F2129' },
];
// Ночная карта для Android (на iPhone — системная тёмная тема карты)
const NIGHT_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1f2129' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8a8f99' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1f2129' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2c2f38' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#151a22' }] },
];

// Старт — Исаакиевская площадь (там демо-снимки)
const START: MapRegion = { latitude: 59.9341, longitude: 30.3061, latitudeDelta: 0.009, longitudeDelta: 0.009 };

// Тёплая приглушённая карта для Android (на iPhone — mutedStandard)
const WARM_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#ece5d8' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8a8073' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f4efe6' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#e2d9c9' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#d9e0cb' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c7d5d2' }] },
];

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const mapRef = useRef<MapView>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [sheet, setSheet] = useState({ y: 0, h: 0 }); // где карточка шкалы — фото ставим выше неё

  const regionSV = useSharedValue<MapRegion>(START);
  const [region, setRegion] = useState<MapRegion>(START);

  const [step, setStep] = useState<Step>(stepPref);
  const [start, setStart] = useState(() => rangeStart(stepPref, new Date()));
  const [index, setIndex] = useState(() => bucketIndex(stepPref, rangeStart(stepPref, new Date()), new Date()));
  const [stepMenu, setStepMenu] = useState(false);
  const [mode, setModeState] = useState<ScaleMode>(scaleModePref);
  const [nudge] = useState(() => {
    const first = !nudged;
    nudged = true;
    return first;
  });
  const setMode = (m: ScaleMode) => {
    scaleModePref = m;
    setModeState(m);
  };
  // S1 ⇄ S2 ⇄ S3: свайп по язычку вниз — сворачиваем на ступень, вверх — раскрываем; тап — из полной в компактную, иначе — в полную
  const gripSwipe = (dir: 'up' | 'down') => {
    const order: ScaleMode[] = ['full', 'compact', 'mini'];
    const i = order.indexOf(mode) + (dir === 'down' ? 1 : -1);
    if (i >= 0 && i < order.length) setMode(order[i]);
  };
  const gripTap = () => setMode(mode === 'full' ? 'compact' : 'full');
  const sheetDrag = useSharedValue(0);
  const sheetDragStyle = useAnimatedStyle(() => ({ transform: [{ translateY: sheetDrag.value }] }));
  const anchor = useRef(new Date());
  const [mapStyle, setMapStyle] = useState<MapStyle>(mapStylePref);
  const [layers, setLayers] = useState(false);
  const [dateSheet, setDateSheet] = useState(false); // B3 · «Когда?»
  const indexSV = useSharedValue(index);
  const now = useSharedValue(index * STEP_MIN + STEP_MIN / 2);
  const [jump, setJump] = useState<{ i: number; key: number } | null>(null);

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [offline, setOffline] = useState(false);
  const [reload, setReload] = useState(0);
  const [fan, setFan] = useState<{ photos: Photo[]; origin: { x: number; y: number }; closing: boolean } | null>(null);
  const firstFocus = useRef(true);

  // Регион, при котором точка встаёт посередине свободной зоны — между поиском и карточкой шкалы
  const focusRegion = useCallback(
    (lat: number, lng: number, lngDelta = 0.006): MapRegion => {
      const w = size.w || 393, h = size.h || 852;
      const latDelta = lngDelta * (h / w) * Math.cos((lat * Math.PI) / 180);
      const freeTop = insets.top + 74;
      const freeBottom = (sheet.y || h * 0.55) - 40;
      const offset = ((freeTop + freeBottom) / 2 - h / 2) / h; // < 0 — выше центра экрана
      return { latitude: lat + offset * latDelta, longitude: lng, latitudeDelta: latDelta, longitudeDelta: lngDelta };
    },
    [size, sheet.y, insets.top],
  );
  const flyTo = useCallback(
    (lat: number, lng: number, lngDelta?: number) => mapRef.current?.animateToRegion(focusRegion(lat, lng, lngDelta), 800),
    [focusRegion],
  );

  // Перейти к моменту: день + интервал на шкале (шкала доедет сама)
  const goTo = useCallback(
    (at: Date) => {
      const st = rangeStart(step, at);
      setStart(st);
      setJump({ i: bucketIndex(step, st, at), key: Date.now() });
    },
    [step],
  );
  // Смена шага: выбранный момент остаётся выбранным, шкала перестраивается
  const changeStep = (next: Step) => {
    setStepMenu(false);
    if (next === step) return;
    // меню закрывается сразу, перестройка шкалы — следующим кадром
    requestAnimationFrame(() => applyStep(next));
  };
  const applyStep = (next: Step) => {
    setJump(null); // старая команда «переехать» не должна сработать на новой шкале
    // точный момент, выбранный раньше на мелком шаге, сохраняем, если он внутри текущего столбика
    const a = bucketStart(step, start, index), b = bucketStart(step, start, index + 1);
    const moment = anchor.current >= a && anchor.current < b ? anchor.current : new Date(a.getTime() + 60000);
    const st = rangeStart(next, moment);
    const i = bucketIndex(next, st, moment);
    stepPref = next;
    setStep(next);
    setStart(st);
    setIndex(i);
    indexSV.value = i;
    now.value = i * STEP_MIN + STEP_MIN / 2;
  };
  // S3: свайп по строке — соседний интервал (через границу суток/месяца/года — в соседний диапазон)
  const stepBy = (delta: number) => {
    const n = bucketCount(step, start);
    let st = start, i = index + delta;
    if (i < 0) {
      st = shiftRange(step, start, -1);
      i = bucketCount(step, st) - 1;
    } else if (i >= n) {
      st = shiftRange(step, start, 1);
      if (st > new Date()) return;
      i = 0;
    }
    if (st !== start) setStart(st);
    setIndex(i);
    indexSV.value = i;
    now.value = withTiming(i * STEP_MIN + STEP_MIN / 2, { duration: 260 });
    Haptics.selectionAsync().catch(() => {});
  };
  const miniGesture = Gesture.Race(
    // горизонталь: срабатывает рано и прощает «дугу» большого пальца (диагональ до ~45°)
    Gesture.Pan()
      .activeOffsetX([-10, 10])
      .failOffsetY([-36, 36])
      .onEnd((e) => {
        if (e.translationX < -24 || e.velocityX < -400) scheduleOnRN(stepBy, 1);
        else if (e.translationX > 24 || e.velocityX > 400) scheduleOnRN(stepBy, -1);
      }),
    // вертикаль: только вверх и только почти прямо — не перехватывает горизонтальные свайпы
    Gesture.Pan()
      .activeOffsetY(-18)
      .failOffsetX([-16, 16])
      .onEnd((e) => {
        if (e.translationY < -20) scheduleOnRN(setMode, 'compact');
      }),
    Gesture.Tap().maxDistance(8).onEnd(() => scheduleOnRN(setMode, 'full')),
  );
  const chooseMapStyle = (m: MapStyle) => {
    mapStylePref = m;
    setMapStyle(m);
  };

  // При старте — к последнему моменту, где здесь есть фото: и карта, и шкала
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !size.w || !sheet.y) return;
    started.current = true;
    fetchLatestIn(regionBounds(START, 3))
      .then((p) => {
        if (!p) return;
        flyTo(p.lat, p.lng);
        goTo(new Date(p.taken_at));
      })
      .catch(() => setOffline(true));
  }, [size.w, sheet.y, flyTo, goTo]);

  // Возврат на карту: обновить лайки и выполнить «перелёт», если его попросили
  useFocusEffect(
    useCallback(() => {
      const f = consumeMapFocus();
      if (f) {
        flyTo(f.lat, f.lng, 0.004);
        if (f.at) goTo(f.at);
      }
      if (firstFocus.current) firstFocus.current = false;
      else setReload((k) => k + 1);
    }, [goTo, flyTo]),
  );

  // Все фото выбранного диапазона в области (с запасом): из кэша — сразу, с сервера — следом
  useEffect(() => {
    let cancelled = false;
    const cached = photoCache.get(cacheKey(step, start, region));
    if (cached) {
      setPhotos(cached);
      setLoaded(true);
    }
    const t = setTimeout(async () => {
      try {
        const list = await loadRange(step, start, region);
        if (cancelled) return;
        setPhotos(list);
        setOffline(false);
      } catch {
        if (!cancelled) setOffline(true);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }, cached ? 400 : 120);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [region, start, step, reload]);

  // Открыли меню шага — заранее подгружаем остальные шаги для этого момента
  useEffect(() => {
    if (!stepMenu) return;
    const moment = bucketStart(step, start, index);
    for (const x of STEPS) {
      if (x.key === step) continue;
      const st = rangeStart(x.key, moment);
      if (!photoCache.has(cacheKey(x.key, st, region))) loadRange(x.key, st, region).catch(() => {});
    }
  }, [stepMenu]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const n = bucketCount(step, start);
    const c = new Array(n).fill(0);
    for (const p of photos) {
      const b = Math.floor(position(step, start, new Date(p.taken_at)));
      if (b >= 0 && b < n) c[b]++;
    }
    return c;
  }, [photos, step, start]);

  // Фото рядом по времени (±2,5 часа) + стопки среди снимков текущего интервала
  const { pins, groups } = useMemo(() => {
    const groups = new Map<string, Photo[]>();
    if (!size.w) return { pins: [] as Pin[], groups };
    // «минуты» здесь — положение на шкале: столбик × 15 (одна формула проявления для любого шага)
    const centre = index * STEP_MIN + STEP_MIN / 2;
    const near = photos
      .map((p) => ({ p, minutes: position(step, start, new Date(p.taken_at)) * STEP_MIN }))
      .filter((o) => Math.abs(o.minutes - centre) <= 150);
    const xy = new Map(near.map((o) => [o.p.id, project(o.p.lat, o.p.lng, region, size.w, size.h)]));
    const isActive = (m: number) => Math.floor(m / STEP_MIN) === index;
    const inWindow = near.filter((o) => isActive(o.minutes)).sort((a, b) => (b.p.like_count ?? 0) - (a.p.like_count ?? 0));
    const d = (a: Photo, b: Photo) => {
      const p = xy.get(a.id)!, q = xy.get(b.id)!;
      return Math.hypot(p.x - q.x, p.y - q.y);
    };
    // Раскладка без наложений:
    // 1) снимки ближе «рамка + подпись» друг к другу собираются в стопку;
    // 2) всё, что попало в круг стопки, уходит в неё;
    // 3) стопки, чьи круги пересекаются, сливаются.
    const TOUCH = PIN + 22; // рамка + подпись времени
    const IN_HALO = HALO / 2 + PIN / 2;
    const free = new Set(inWindow.map((o) => o.p.id));
    let list: Photo[][] = [];
    for (const o of inWindow) {
      if (!free.has(o.p.id)) continue;
      free.delete(o.p.id);
      const g = [o.p];
      for (const q of inWindow) if (free.has(q.p.id) && d(o.p, q.p) < TOUCH) (g.push(q.p), free.delete(q.p.id));
      if (g.length > 1) for (const q of inWindow) if (free.has(q.p.id) && d(o.p, q.p) < IN_HALO) (g.push(q.p), free.delete(q.p.id));
      list.push(g);
    }
    for (let changed = true; changed; ) {
      changed = false;
      outer: for (let i = 0; i < list.length; i++)
        for (let j = i + 1; j < list.length; j++) {
          const A = list[i], B = list[j];
          const stacks = (A.length > 1 ? 1 : 0) + (B.length > 1 ? 1 : 0);
          const limit = stacks === 2 ? HALO : stacks === 1 ? IN_HALO : TOUCH;
          if (d(A[0], B[0]) < limit) {
            list[i] = [...A, ...B]; // первым остаётся более «залайканный» лидер
            list = list.filter((_, k) => k !== j);
            changed = true;
            break outer;
          }
        }
    }
    const hidden = new Set<string>();
    for (const g of list) {
      groups.set(g[0].id, g);
      g.slice(1).forEach((p) => hidden.add(p.id));
    }
    // снимки соседнего времени: не лезут на текущие и не громоздятся друг на друга (остаётся ближайший по времени)
    const leaders = list.map((g) => ({ p: g[0], r: g.length > 1 ? IN_HALO : TOUCH }));
    const kept: Photo[] = [];
    const covered = new Set<string>();
    near
      .filter((o) => !isActive(o.minutes))
      .sort((a, b) => Math.abs(a.minutes - centre) - Math.abs(b.minutes - centre))
      .forEach((o) => {
        if (leaders.some((l) => d(o.p, l.p) < l.r) || kept.some((k) => d(o.p, k) < TOUCH)) covered.add(o.p.id);
        else kept.push(o.p);
      });
    const fanIds = new Set(fan?.photos.map((p) => p.id));
    const pins: Pin[] = near.map((o) => {
      const g = groups.get(o.p.id);
      return {
        photo: o.p,
        minutes: o.minutes,
        active: isActive(o.minutes),
        suppressed: hidden.has(o.p.id) || covered.has(o.p.id) || fanIds.has(o.p.id),
        badge: g ? g.length - 1 : 0,
        under1: g?.[1]?.storage_path,
        under2: g?.[2]?.storage_path,
      };
    });
    return { pins, groups };
  }, [photos, step, start, index, region, size, fan]);

  const windowFrom = bucketStart(step, start, index).getTime();
  const openMoment = useCallback(
    (lat: number, lng: number, radius: number, title?: string | null) =>
      router.push({
        pathname: '/moment',
        params: { lat: String(lat), lng: String(lng), radius: String(Math.round(radius)), from: String(windowFrom), title: title ?? '' },
      }),
    [windowFrom],
  );
  const openPhoto = useCallback((p: Photo) => router.push({ pathname: '/photo/[id]', params: { id: p.id } }), []);
  // Тап по снимку: одиночный — открыть; стопка до 5 — раскрыть веером; больше — лента момента
  const onPinPress = useCallback(
    (p: Photo) => {
      const g = groups.get(p.id) ?? [p];
      if (g.length <= 1) return openPhoto(p);
      if (g.length > 5) return openMoment(p.lat, p.lng, 120, p.place_name);
      setFan({ photos: g, origin: project(p.lat, p.lng, regionSV.value, size.w, size.h), closing: false });
    },
    [groups, openPhoto, openMoment, regionSV, size],
  );
  const closeFan = useCallback(() => setFan((f) => (f ? { ...f, closing: true } : f)), []);
  const fanClosed = useCallback(() => setFan(null), []);

  const locateMe = async () => {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return Alert.alert('Нет доступа к геопозиции', 'Разрешите его в настройках телефона.');
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    flyTo(pos.coords.latitude, pos.coords.longitude, 0.008);
  };

  const toLatest = async () => {
    // ищем всё шире: рядом, затем по городу
    let p = await fetchLatestIn(regionBounds(region, 1.5)).catch(() => null);
    if (!p) p = await fetchLatestIn(regionBounds(region, 30)).catch(() => null);
    if (p) {
      flyTo(p.lat, p.lng);
      goTo(new Date(p.taken_at));
    }
    else Alert.alert('Здесь пока нет фото', 'Станьте первым — нажмите «+» внизу.');
  };

  const inWindow = counts[index] ?? 0;
  // запоминаем выбранный момент на мелких шагах — к нему вернёмся с недели или дня
  useEffect(() => {
    if (step === '15m' || step === 'hour') anchor.current = new Date(bucketStart(step, start, index).getTime() + 60000);
  }, [step, start, index]);
  // B2: ближайший интервал с фото — показываем, когда шкала остановилась на пустом
  const [settled, setSettled] = useState(index);
  useEffect(() => {
    const t = setTimeout(() => setSettled(index), 450);
    return () => clearTimeout(t);
  }, [index]);
  const nearest = useMemo(() => {
    if (inWindow > 0) return null;
    for (let k = 1; k < counts.length; k++) {
      for (const j of [index - k, index + k]) if (j >= 0 && j < counts.length && counts[j] > 0) return { i: j, n: counts[j] };
    }
    return null;
  }, [counts, index, inWindow]);
  // B1: кто снимал в этот момент — аватары и счётчик под шкалой
  const windowPhotos = useMemo(
    () => photos.filter((p) => Math.floor(position(step, start, new Date(p.taken_at))) === index),
    [photos, step, start, index],
  );
  const windowAuthors = useMemo(() => Array.from(new Map(windowPhotos.map((p) => [p.user_id, p])).values()), [windowPhotos]);
  // B1: в поиске — название места в центре карты (по ближайшему снимку)
  const placeName = useMemo(() => {
    let best: string | null = null, bd = Infinity;
    for (const p of knownPlaces.values()) {
      const dd = (p.lat - region.latitude) ** 2 + (p.lng - region.longitude) ** 2;
      if (dd < bd) (bd = dd), (best = p.name);
    }
    const r = region.latitudeDelta / 2;
    return best && bd < r * r ? best : null;
  }, [photos, region]);
  const dayTotal = photos.length;
  const isToday = isCurrentRange(step, start);
  const clockStep = step === '15m' || step === 'hour';
  const sheetBottom = Math.max(insets.bottom, 12) + TAB_BAR_SPACE;

  return (
    <View style={styles.root} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {/* на спутнике и ночной карте — светлые часы и батарея */}
      <StatusBar style={mapStyle === 'warm' ? 'dark' : 'light'} />
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={START}
        onRegionChange={(r) => {
          regionSV.value = r;
        }}
        onRegionChangeComplete={(r) => {
          regionSV.value = r;
          setRegion(r);
        }}
        mapType={mapStyle === 'satellite' ? 'hybrid' : Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
        customMapStyle={mapStyle === 'night' ? NIGHT_STYLE : WARM_STYLE}
        userInterfaceStyle={mapStyle === 'night' ? 'dark' : 'light'}
        rotateEnabled={false}
        pitchEnabled={false}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        showsPointsOfInterests={false}
      />

      {size.w > 0 && <MomentLayer pins={pins} region={regionSV} width={size.w} height={size.h} now={now} onPress={onPinPress} />}

      {/* Верх: поиск (название места) и слои — B1 */}
      <View style={[styles.top, { top: insets.top + 8 }]} pointerEvents="box-none">
        <Pressable style={styles.search} onPress={() => Alert.alert('Поиск мест', 'Появится в следующем шаге.')}>
          <Icon name="search" size={20} color={D.ink} />
          <Text style={[styles.searchText, !placeName && { color: D.ink60 }]} numberOfLines={1}>
            {placeName ?? 'Найти место'}
          </Text>
        </Pressable>
        <RoundButton icon="layers" size={46} label="Вид карты" onPress={() => setLayers(true)} />
      </View>

      {/* «Где я» — справа над шкалой — B1 */}
      {sheet.h > 0 && (
        <View style={[styles.locate, { bottom: sheetBottom + sheet.h + 18 }]} pointerEvents="box-none">
          <RoundButton icon="locate" label="Где я" onPress={locateMe} />
        </View>
      )}

      {offline && (
        <Animated.View entering={FadeIn} exiting={FadeOut} style={[styles.banner, { top: insets.top + 64 }]}>
          <Text style={styles.bannerText}>Нет связи · показываем сохранённое</Text>
        </Animated.View>
      )}

      {loaded && dayTotal === 0 && !offline && (
        <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut} style={[styles.empty, { bottom: sheetBottom + sheet.h + 74 }]}>
          <Text style={styles.emptyTitle}>{emptyRangeTitle[step]}</Text>
          <PillButton title="К последним фото" small onPress={toLatest} icon="arrow" />
        </Animated.View>
      )}

      {/* B2 · пустой момент: в интервале никого, предлагаем ближайший с фото */}
      {loaded && !offline && dayTotal > 0 && clockStep && nearest && settled === index && (
        <Animated.View key={index} entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)} style={[styles.b2, { bottom: sheetBottom + sheet.h + 74 }]}>
          <View style={styles.b2Head}>
            <Icon name="clock" size={26} color={D.sun} />
            <Text style={styles.b2Title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
              В {clock(step, start, index)} здесь никого не было
            </Text>
          </View>
          <Text style={styles.b2Text}>
            Ближайшие фото — в {clock(step, start, nearest.i)}, их {nearest.n}.{bucketStart(step, start, index).getHours() < 6 ? ' Ночью это место пустеет.' : ''}
          </Text>
          <Pressable
            onPress={() => setJump({ i: nearest.i, key: Date.now() })}
            style={({ pressed }) => [styles.b2Btn, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.b2BtnText}>Перейти к {clock(step, start, nearest.i)}</Text>
            <Icon name="arrow" size={16} color={D.white} />
          </Pressable>
        </Animated.View>
      )}

      {/* Карточка шкалы времени: полная (S1), компактная (S2) или одна строка (S3) */}
      <Animated.View
        layout={LinearTransition.springify().damping(SHEET_SPRING.damping).stiffness(SHEET_SPRING.stiffness).mass(SHEET_SPRING.mass)}
        style={[styles.sheet, mode === 'mini' && styles.sheetMini, { bottom: sheetBottom }, sheetDragStyle]}
        onLayout={(e) => setSheet({ y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height })}
      >
        <ScaleGrip mode={mode} onTap={gripTap} onSwipe={gripSwipe} nudge={nudge && mode === 'full'} drag={sheetDrag} />
        {mode === 'mini' ? (
          <Animated.View key="mini" entering={FadeIn.duration(220)} style={styles.miniRow}>
            {/* свайп по строке — соседний интервал; вверх или тап — раскрыть */}
            <GestureDetector gesture={miniGesture}>
              <View style={styles.miniSwipe} collapsable={false}>
                <Text style={styles.miniTime}>{clockStep ? clock(step, start, index) : bigLabel(step, start, index)}</Text>
                <Text style={styles.miniMeta} numberOfLines={1}>
                  {rangeLabel(step, start).replace(/ \d{4}$/, '')} · {inWindow} фото
                </Text>
              </View>
            </GestureDetector>
            <Pressable onPress={() => setStepMenu((v) => !v)} style={styles.stepChip} hitSlop={6} accessibilityLabel="Шаг шкалы">
              <Text style={styles.stepText}>{STEPS.find((x) => x.key === step)!.chip}</Text>
              <Icon name="chevD" size={14} color={D.ink} />
            </Pressable>
          </Animated.View>
        ) : (
          <Animated.View key="scale" entering={FadeIn.duration(220)}>
            <TimeScrubber
              key={`${step}:${counts.length}`}
              compact={mode === 'compact'}
              ticks={ticks(step, start)}
              counts={counts}
              initialIndex={index}
              now={now}
              index={indexSV}
              onIndexChange={setIndex}
              jumpTo={jump}
              footer={
                mode === 'full' ? (
            inWindow > 0 ? (
              <View style={styles.summary}>
                <View style={styles.summaryAvas}>
                  {windowAuthors.slice(0, 4).map((p, k) =>
                    p.author_avatar ? (
                      <Image key={p.user_id} source={{ uri: p.author_avatar }} style={[styles.summaryAva, { marginLeft: k ? -8 : 0, zIndex: 10 - k }]} />
                    ) : (
                      <View key={p.user_id} style={[styles.summaryAva, { marginLeft: k ? -8 : 0, zIndex: 10 - k, backgroundColor: D.sun }]} />
                    ),
                  )}
                </View>
                <Text style={styles.summaryText} numberOfLines={1}>
                  {inWindow} фото · {windowAuthors.length} {plural(windowAuthors.length, 'автор', 'автора', 'авторов')} {momentSuffix[step]}
                </Text>
              </View>
            ) : null
                ) : null
              }
              header={
            <View style={styles.head}>
              <View style={styles.dayRow}>
                <Pressable hitSlop={10} onPress={() => setStart((st) => shiftRange(step, st, -1))} accessibilityLabel="Назад">
                  <Icon name="chevL" size={16} color={D.ink60} />
                </Pressable>
                {/* B3: тап по дате — выбор даты и времени */}
                <Pressable hitSlop={{ top: 10, bottom: 10 }} onPress={() => setDateSheet(true)} accessibilityRole="button" accessibilityLabel="Выбрать дату и время">
                  <Text style={styles.day}>{rangeLabel(step, start)}</Text>
                </Pressable>
                <Pressable hitSlop={10} disabled={isToday} onPress={() => setStart((st) => shiftRange(step, st, 1))} accessibilityLabel="Вперёд">
                  <Icon name="chevR" size={16} color={isToday ? D.line : D.ink60} />
                </Pressable>
                <View style={{ flex: 1 }} />
                {!isToday && (
                  <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)}>
                    <Pressable onPress={() => goTo(new Date())} style={styles.todayChip} hitSlop={6}>
                      <Text style={styles.todayText}>Сейчас</Text>
                    </Pressable>
                  </Animated.View>
                )}
                <Pressable onPress={() => setStepMenu((v) => !v)} style={styles.stepChip} hitSlop={6} accessibilityLabel="Шаг шкалы">
                  <Text style={styles.stepText}>{STEPS.find((x) => x.key === step)!.chip}</Text>
                  <Icon name="chevD" size={14} color={D.ink} />
                </Pressable>
              </View>
              <View style={styles.timeRow}>
                {clockStep ? (
                  <RollingTime key={step} index={indexSV} initial={index} step={step === 'hour' ? 60 : STEP_MIN} size={50} />
                ) : (
                  <Animated.Text key={`${step}${start.getTime()}${index}`} entering={FadeIn.duration(220)} style={styles.bigLabel}>
                    {bigLabel(step, start, index)}
                  </Animated.Text>
                )}
                <View style={[styles.timeMeta, styles.untilRow]}>
                  {/* U5: конец окна — через многоточие по нижнему краю, чтобы не читалось как минус */}
                  {clockStep && (
                    <View style={styles.ellipsis}>
                      <View style={styles.ellDot} />
                      <View style={styles.ellDot} />
                      <View style={styles.ellDot} />
                    </View>
                  )}
                  <Text style={styles.until}>
                    {untilLabel(step, start, index)}
                    {inWindow === 0 ? ' · 0 фото' : ''}
                  </Text>
                </View>
              </View>
            </View>
              }
            />
          </Animated.View>
        )}
      </Animated.View>

      {/* M2 · меню шага над шкалой */}
      {stepMenu && (
        <>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setStepMenu(false)} accessibilityLabel="Закрыть меню" />
          <Animated.View entering={FadeInDown.duration(180)} exiting={FadeOut.duration(120)} style={[styles.stepMenu, { bottom: sheetBottom + sheet.h + 10 }]}>
            {STEPS.map((x) => (
              <Pressable key={x.key} onPress={() => changeStep(x.key)} style={({ pressed }) => [styles.stepRow, pressed && { backgroundColor: D.paper }]}>
                <Text style={[styles.stepRowText, x.key === step && styles.stepRowOn]}>{x.menu}</Text>
                {x.key === step && <Icon name="check" size={16} color={D.sun} />}
              </Pressable>
            ))}
          </Animated.View>
        </>
      )}

      <TabBar
        active="map"
        onMap={() => {}}
        onMoments={() => openMoment(region.latitude, region.longitude, regionRadiusM(region))}
        onAdd={() => router.push(session ? '/add' : '/sign-in')}
        onProfile={() => router.push(session ? '/profile' : '/sign-in')}
      />

      {/* M6 · вид карты */}
      {layers && (
        <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(180)} style={styles.dim}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setLayers(false)} accessibilityLabel="Закрыть" />
          <Animated.View
            entering={SlideInDown.springify().damping(SHEET_SPRING.damping).stiffness(SHEET_SPRING.stiffness).mass(SHEET_SPRING.mass)}
            exiting={SlideOutDown.duration(200)}
            style={[styles.layersSheet, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}
          >
            <View style={styles.grab} />
            <Text style={styles.layersTitle}>Вид карты</Text>
            <View style={styles.tiles}>
              {MAP_STYLES.map((m) => (
                <Pressable key={m.key} onPress={() => chooseMapStyle(m.key)} style={styles.tile} accessibilityLabel={m.label}>
                  <View style={[styles.tilePic, { backgroundColor: m.color }, mapStyle === m.key && styles.tileOn]} />
                  <Text style={[styles.tileText, mapStyle === m.key && styles.tileTextOn]}>{m.label}</Text>
                </Pressable>
              ))}
            </View>
          </Animated.View>
        </Animated.View>
      )}

      {/* B3 · выбор даты и времени */}
      {dateSheet && (
        <DateSheet
          step={step}
          moment={(() => {
            const a = bucketStart(step, start, index), b = bucketStart(step, start, index + 1);
            return anchor.current >= a && anchor.current < b ? anchor.current : a;
          })()}
          bounds={regionBounds(region, 1.6)}
          onClose={() => setDateSheet(false)}
          onPick={(at) => {
            setDateSheet(false);
            anchor.current = at;
            goTo(at);
          }}
        />
      )}

      {fan && (
        <StackFan
          photos={fan.photos}
          origin={fan.origin}
          width={size.w}
          top={insets.top + 70}
          bottom={sheet.y || size.h * 0.6}
          closing={fan.closing}
          onClose={closeFan}
          onClosed={fanClosed}
          onPick={(p) => {
            setFan(null);
            openPhoto(p);
          }}
          onAll={() => {
            const p = fan.photos[0];
            setFan(null);
            openMoment(p.lat, p.lng, 120, p.place_name);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: D.mapBase },
  top: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 1000, elevation: 30 },
  search: {
    flex: 1, height: 46, borderRadius: 23, backgroundColor: D.white, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16,
    shadowColor: '#17120D', shadowOpacity: 0.12, shadowRadius: 9, shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
  searchText: { flex: 1, fontFamily: F.sansMedium, fontSize: 15, color: D.ink },
  locate: { position: 'absolute', right: 16, zIndex: 1000, elevation: 30 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, marginTop: 8, marginBottom: 6 },
  summaryAvas: { flexDirection: 'row' },
  summaryAva: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: D.white, margin: -2 },
  summaryText: { flex: 1, fontFamily: F.sansMedium, fontSize: 13, color: D.ink },
  banner: { position: 'absolute', alignSelf: 'center', backgroundColor: D.ink, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, zIndex: 1000, elevation: 30 },
  bannerText: { fontFamily: F.sansMedium, fontSize: 13, color: D.paper },
  empty: {
    position: 'absolute', alignSelf: 'center', alignItems: 'center', gap: 10, backgroundColor: D.white,
    padding: 16, borderRadius: 20, ...softShadow, zIndex: 1000, elevation: 30,
  },
  emptyTitle: { fontFamily: F.sansSemi, fontSize: 15, color: D.ink },
  b2: {
    position: 'absolute', left: 32, right: 32, backgroundColor: D.white, borderRadius: 24, padding: 20, paddingTop: 22, gap: 14, zIndex: 1000, elevation: 30,
    shadowColor: '#17120D', shadowOpacity: 0.14, shadowRadius: 30, shadowOffset: { width: 0, height: 10 },
  },
  b2Head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  b2Title: { flex: 1, fontFamily: F.sansSemi, fontSize: 17, color: D.ink },
  b2Text: { fontFamily: F.sans, fontSize: 14, lineHeight: 20, color: D.ink60, marginTop: -2 },
  b2Btn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: D.sun, borderRadius: 999, paddingLeft: 16, paddingRight: 14, paddingVertical: 10 },
  b2BtnText: { fontFamily: F.sansSemi, fontSize: 14, color: D.white },
  sheet: {
    position: 'absolute', left: 12, right: 12, backgroundColor: D.white, borderRadius: 28, paddingTop: 16, paddingBottom: 6, ...softShadow, zIndex: 1000, elevation: 30,
  },
  sheetMini: { paddingTop: 0, paddingBottom: 0 },
  miniRow: { height: 64, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20 },
  miniTime: { fontFamily: F.serif, fontSize: 28, color: D.ink },
  miniSwipe: { flex: 1, height: 64, flexDirection: 'row', alignItems: 'center', gap: 10 },
  miniMeta: { flexShrink: 1, fontFamily: F.mono, fontSize: 11, color: D.ink60, letterSpacing: 0.66 },
  head: { paddingHorizontal: 20 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 27 },
  day: { fontFamily: F.mono, fontSize: 11, color: D.ink60, letterSpacing: 0.66 },
  stepChip: { height: 27, flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 10, paddingRight: 8, borderRadius: 999, borderWidth: 1, borderColor: D.line },
  stepText: { fontFamily: F.sansMedium, fontSize: 12, color: D.ink },
  bigLabel: { fontFamily: F.serif, fontSize: 50, lineHeight: 59, color: D.ink, marginLeft: 4 },
  stepMenu: {
    position: 'absolute', right: 30, width: 170, backgroundColor: D.white, borderRadius: 18, paddingVertical: 6, zIndex: 2000, elevation: 40,
    shadowColor: '#17120D', shadowOpacity: 0.18, shadowRadius: 30, shadowOffset: { width: 0, height: 10 },
  },
  stepRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 11 },
  stepRowText: { flex: 1, fontFamily: F.sans, fontSize: 15, color: D.ink },
  stepRowOn: { fontFamily: F.sansSemi, color: D.sun },
  dim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(22,19,15,0.45)', justifyContent: 'flex-end', zIndex: 3000, elevation: 50 },
  layersSheet: { backgroundColor: D.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 10, paddingHorizontal: 24, gap: 14 },
  grab: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: D.line },
  layersTitle: { fontFamily: F.serif, fontSize: 24, color: D.ink },
  tiles: { flexDirection: 'row', gap: 12 },
  tile: { flex: 1, alignItems: 'center', gap: 8 },
  tilePic: { alignSelf: 'stretch', height: 80, borderRadius: 16 },
  tileOn: { borderWidth: 3, borderColor: D.sun },
  tileText: { fontFamily: F.sans, fontSize: 14, color: D.ink },
  tileTextOn: { fontFamily: F.sansSemi, color: D.sun },
  todayChip: { height: 27, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 999, backgroundColor: D.sunSoft },
  todayText: { fontFamily: F.sansSemi, fontSize: 12, color: D.sun },
  timeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2, marginBottom: 8, marginLeft: -4 },
  timeMeta: { marginLeft: 12, marginTop: 8 },
  until: { fontFamily: F.sans, fontSize: 18, color: D.ink60 },
  untilRow: { flexDirection: 'row', alignItems: 'flex-end' },
  ellipsis: { flexDirection: 'row', gap: 2.6, marginRight: 3, marginBottom: 6 },
  ellDot: { width: 2.6, height: 2.6, borderRadius: 1.3, backgroundColor: D.ink60, opacity: 0.8 },
});
