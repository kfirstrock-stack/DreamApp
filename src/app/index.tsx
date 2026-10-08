import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import MapView from 'react-native-maps';
import Animated, { FadeIn, FadeOut, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { HALO, MomentLayer, PIN, type Pin } from '@/components/map/MomentLayer';
import { StackFan } from '@/components/map/StackFan';
import { RollingTime } from '@/components/time/RollingTime';
import { TimeScrubber } from '@/components/time/TimeScrubber';
import { PillButton } from '@/components/ui/PillButton';
import { RoundButton } from '@/components/ui/RoundButton';
import { TAB_BAR_SPACE, TabBar } from '@/components/ui/TabBar';
import { useAuth } from '@/lib/auth';
import { BUCKETS, D, F, STEP_MIN, softShadow } from '@/lib/design';
import { consumeMapFocus } from '@/lib/focus';
import { project, regionBounds, regionRadiusM, type MapRegion } from '@/lib/geo';
import { fetchLatestIn, fetchPhotosV2 } from '@/lib/photos';
import type { Photo } from '@/lib/types';

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

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const bucketOf = (d: Date, day: Date) =>
  Math.min(BUCKETS - 1, Math.max(0, Math.floor((d.getTime() - day.getTime()) / 60000 / STEP_MIN)));
const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (m: number) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
const WD = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];
const MON = ['ЯНВАРЯ', 'ФЕВРАЛЯ', 'МАРТА', 'АПРЕЛЯ', 'МАЯ', 'ИЮНЯ', 'ИЮЛЯ', 'АВГУСТА', 'СЕНТЯБРЯ', 'ОКТЯБРЯ', 'НОЯБРЯ', 'ДЕКАБРЯ'];
const dayLabel = (d: Date) => `${WD[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`;
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

  const today = startOfDay(new Date());
  const [day, setDay] = useState(today);
  const [index, setIndex] = useState(() => bucketOf(new Date(), today));
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
  const goTo = useCallback((at: Date) => {
    const d = startOfDay(at);
    setDay(d);
    setJump({ i: bucketOf(at, d), key: Date.now() });
  }, []);

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

  // Все фото выбранного дня в области (с запасом) — проявление по времени считается на телефоне
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const list = await fetchPhotosV2(regionBounds(region, 1.6), day, addDays(day, 1), 800);
        if (cancelled) return;
        setPhotos(list);
        setOffline(false);
      } catch {
        if (!cancelled) setOffline(true);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [region, day, reload]);

  const counts = useMemo(() => {
    const c = new Array(BUCKETS).fill(0);
    const ms = day.getTime();
    for (const p of photos) {
      const b = Math.floor((new Date(p.taken_at).getTime() - ms) / 60000 / STEP_MIN);
      if (b >= 0 && b < BUCKETS) c[b]++;
    }
    return c;
  }, [photos, day]);

  // Фото рядом по времени (±2,5 часа) + стопки среди снимков текущего интервала
  const { pins, groups } = useMemo(() => {
    const groups = new Map<string, Photo[]>();
    if (!size.w) return { pins: [] as Pin[], groups };
    const ms = day.getTime();
    const centre = index * STEP_MIN + STEP_MIN / 2;
    const near = photos
      .map((p) => ({ p, minutes: (new Date(p.taken_at).getTime() - ms) / 60000 }))
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
  }, [photos, day, index, region, size, fan]);

  const windowFrom = day.getTime() + index * STEP_MIN * 60000;
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
  // B1: кто снимал в этот момент — аватары и счётчик под шкалой
  const windowPhotos = useMemo(() => {
    const ms = day.getTime();
    return photos.filter((p) => Math.floor((new Date(p.taken_at).getTime() - ms) / 60000 / STEP_MIN) === index);
  }, [photos, day, index]);
  const windowAuthors = useMemo(() => Array.from(new Map(windowPhotos.map((p) => [p.user_id, p])).values()), [windowPhotos]);
  // B1: в поиске — название места в центре карты (по ближайшему снимку)
  const placeName = useMemo(() => {
    let best: Photo | null = null, bd = Infinity;
    for (const p of photos) {
      if (!p.place_name) continue;
      const dd = (p.lat - region.latitude) ** 2 + (p.lng - region.longitude) ** 2;
      if (dd < bd) (bd = dd), (best = p);
    }
    const r = region.latitudeDelta / 2;
    return best && bd < r * r ? best.place_name : null;
  }, [photos, region]);
  const dayTotal = photos.length;
  const isToday = day.getTime() === today.getTime();
  const sheetBottom = Math.max(insets.bottom, 12) + TAB_BAR_SPACE;

  return (
    <View style={styles.root} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
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
        mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
        customMapStyle={WARM_STYLE}
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
        <RoundButton icon="layers" size={46} label="Слои" onPress={() => {}} />
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
        <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut} style={[styles.empty, { bottom: sheetBottom + sheet.h + 12 }]}>
          <Text style={styles.emptyTitle}>В этот день здесь пусто</Text>
          <PillButton title="К последним фото" small onPress={toLatest} icon="arrow" />
        </Animated.View>
      )}

      {/* Карточка шкалы времени */}
      <View style={[styles.sheet, { bottom: sheetBottom }]} onLayout={(e) => setSheet({ y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height })}>
        <TimeScrubber
          counts={counts}
          initialIndex={index}
          now={now}
          index={indexSV}
          onIndexChange={setIndex}
          jumpTo={jump}
          footer={
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
                  {inWindow} фото · {windowAuthors.length} {plural(windowAuthors.length, 'автор', 'автора', 'авторов')} в этот момент
                </Text>
              </View>
            ) : null
          }
          header={
            <View style={styles.head}>
              <View style={styles.dayRow}>
                <Pressable hitSlop={10} onPress={() => setDay((d) => addDays(d, -1))} accessibilityLabel="Предыдущий день">
                  <Icon name="chevL" size={16} color={D.ink60} />
                </Pressable>
                <Text style={styles.day}>{dayLabel(day)}</Text>
                <Pressable hitSlop={10} disabled={isToday} onPress={() => setDay((d) => addDays(d, 1))} accessibilityLabel="Следующий день">
                  <Icon name="chevR" size={16} color={isToday ? D.line : D.ink60} />
                </Pressable>
                <View style={{ flex: 1 }} />
                <Pressable
                  onPress={() => goTo(new Date())}
                  disabled={isToday}
                  style={[styles.todayChip, isToday && { opacity: 0 }]}
                  hitSlop={6}
                  accessibilityElementsHidden={isToday}
                >
                  <Text style={styles.todayText}>Сейчас</Text>
                </Pressable>
              </View>
              <View style={styles.timeRow}>
                <RollingTime index={indexSV} step={STEP_MIN} size={50} />
                <View style={styles.timeMeta}>
                  <Text style={styles.until}>
                    –{hhmm((index + 1) * STEP_MIN)}
                    {inWindow === 0 ? ' · 0 фото' : ''}
                  </Text>
                </View>
              </View>
            </View>
          }
        />
      </View>

      <TabBar
        active="map"
        onMap={() => {}}
        onMoments={() => openMoment(region.latitude, region.longitude, regionRadiusM(region))}
        onAdd={() => router.push(session ? '/add' : '/sign-in')}
        onProfile={() => router.push(session ? '/profile' : '/sign-in')}
      />

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
  sheet: {
    position: 'absolute', left: 12, right: 12, backgroundColor: D.white, borderRadius: 28, paddingTop: 16, paddingBottom: 6, ...softShadow, zIndex: 1000, elevation: 30,
  },
  head: { paddingHorizontal: 18 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 26 },
  day: { fontFamily: F.mono, fontSize: 11, color: D.ink60, letterSpacing: 1.1, minWidth: 196, textAlign: 'center' },
  todayChip: { height: 24, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 12, backgroundColor: D.sunSoft },
  todayText: { fontFamily: F.sansSemi, fontSize: 12, color: D.sun },
  timeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2, marginBottom: 8, marginLeft: -4 },
  timeMeta: { marginLeft: 12, marginTop: 8 },
  until: { fontFamily: F.sans, fontSize: 18, color: D.ink60 },
});
