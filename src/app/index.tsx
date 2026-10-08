import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView from 'react-native-maps';
import Animated, { FadeIn, FadeOut, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { MomentLayer, PIN, type Pin } from '@/components/map/MomentLayer';
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
const mood = (n: number) => (n === 0 ? 'никого' : n < 3 ? 'тихо' : n < 6 ? 'людно' : 'очень людно');

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const mapRef = useRef<MapView>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

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
  const firstFocus = useRef(true);

  // Перейти к моменту: день + интервал на шкале (шкала доедет сама)
  const goTo = useCallback((at: Date) => {
    const d = startOfDay(at);
    setDay(d);
    setJump({ i: bucketOf(at, d), key: Date.now() });
  }, []);

  // При старте — к последнему моменту, где здесь есть фото
  useEffect(() => {
    fetchLatestIn(regionBounds(START, 1.5))
      .then((p) => p && goTo(new Date(p.taken_at)))
      .catch(() => setOffline(true));
  }, [goTo]);

  // Возврат на карту: обновить лайки и выполнить «перелёт», если его попросили
  useFocusEffect(
    useCallback(() => {
      const f = consumeMapFocus();
      if (f) {
        mapRef.current?.animateToRegion({ latitude: f.lat, longitude: f.lng, latitudeDelta: 0.004, longitudeDelta: 0.004 }, 700);
        if (f.at) goTo(f.at);
      }
      if (firstFocus.current) firstFocus.current = false;
      else setReload((k) => k + 1);
    }, [goTo]),
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
  const pins = useMemo<Pin[]>(() => {
    if (!size.w) return [];
    const ms = day.getTime();
    const centre = index * STEP_MIN + STEP_MIN / 2;
    const near = photos
      .map((p) => ({ p, minutes: (new Date(p.taken_at).getTime() - ms) / 60000 }))
      .filter((o) => Math.abs(o.minutes - centre) <= 150);
    const inWindow = near
      .filter((o) => Math.floor(o.minutes / STEP_MIN) === index)
      .sort((a, b) => (b.p.like_count ?? 0) - (a.p.like_count ?? 0));
    const xy = new Map(inWindow.map((o) => [o.p.id, project(o.p.lat, o.p.lng, region, size.w, size.h)]));
    const leaders = new Map<string, number>();
    const hidden = new Set<string>();
    for (const o of inWindow) {
      if (hidden.has(o.p.id)) continue;
      const a = xy.get(o.p.id)!;
      let n = 0;
      for (const q of inWindow) {
        if (q === o || hidden.has(q.p.id) || leaders.has(q.p.id)) continue;
        const b = xy.get(q.p.id)!;
        if (Math.hypot(a.x - b.x, a.y - b.y) < PIN * 0.9) {
          hidden.add(q.p.id);
          n++;
        }
      }
      leaders.set(o.p.id, n);
    }
    return near.map((o) => ({
      photo: o.p,
      minutes: o.minutes,
      active: Math.floor(o.minutes / STEP_MIN) === index,
      suppressed: hidden.has(o.p.id),
      badge: leaders.get(o.p.id) ?? 0,
    }));
  }, [photos, day, index, region, size]);

  const windowFrom = day.getTime() + index * STEP_MIN * 60000;
  const openMoment = useCallback(
    (lat: number, lng: number, radius: number, title?: string | null) =>
      router.push({
        pathname: '/moment',
        params: { lat: String(lat), lng: String(lng), radius: String(Math.round(radius)), from: String(windowFrom), title: title ?? '' },
      }),
    [windowFrom],
  );
  const onPinPress = useCallback(
    (p: Photo, isStack: boolean) =>
      isStack ? openMoment(p.lat, p.lng, 120, p.place_name) : router.push({ pathname: '/photo/[id]', params: { id: p.id } }),
    [openMoment],
  );

  const locateMe = async () => {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return Alert.alert('Нет доступа к геопозиции', 'Разрешите его в настройках телефона.');
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    mapRef.current?.animateToRegion({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, latitudeDelta: 0.008, longitudeDelta: 0.008 }, 700);
  };

  const toLatest = async () => {
    const p = await fetchLatestIn(regionBounds(region, 1.3)).catch(() => null);
    if (p) goTo(new Date(p.taken_at));
    else Alert.alert('Здесь пока нет фото', 'Станьте первым — нажмите «+» внизу.');
  };

  const inWindow = counts[index] ?? 0;
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

      {/* Верх: поиск и «где я» */}
      <View style={[styles.top, { top: insets.top + 8 }]} pointerEvents="box-none">
        <Pressable style={styles.search} onPress={() => Alert.alert('Поиск мест', 'Появится в следующем шаге.')}>
          <Icon name="search" size={18} color={D.ink60} />
          <Text style={styles.searchText}>Найти место</Text>
        </Pressable>
        <RoundButton icon="locate" label="Где я" onPress={locateMe} />
      </View>

      {offline && (
        <Animated.View entering={FadeIn} exiting={FadeOut} style={[styles.banner, { top: insets.top + 64 }]}>
          <Text style={styles.bannerText}>Нет связи · показываем сохранённое</Text>
        </Animated.View>
      )}

      {loaded && dayTotal === 0 && !offline && (
        <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut} style={[styles.empty, { top: insets.top + 70 }]}>
          <Text style={styles.emptyTitle}>В этот день здесь пусто</Text>
          <PillButton title="К последним фото" small onPress={toLatest} icon="arrow" />
        </Animated.View>
      )}

      {/* Карточка шкалы времени */}
      <View style={[styles.sheet, { bottom: sheetBottom }]}>
        <TimeScrubber
          counts={counts}
          initialIndex={index}
          now={now}
          index={indexSV}
          onIndexChange={setIndex}
          jumpTo={jump}
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
                  <Text style={styles.until}>–{hhmm((index + 1) * STEP_MIN)}</Text>
                  <Text style={styles.count}>
                    {inWindow} фото · {mood(inWindow)}
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: D.mapBase },
  top: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 1000, elevation: 30 },
  search: {
    flex: 1, height: 46, borderRadius: 23, backgroundColor: D.white, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, ...softShadow,
  },
  searchText: { fontFamily: F.sansMedium, fontSize: 15, color: D.ink60 },
  banner: { position: 'absolute', alignSelf: 'center', backgroundColor: D.ink, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, zIndex: 1000, elevation: 30 },
  bannerText: { fontFamily: F.sansMedium, fontSize: 13, color: D.paper },
  empty: {
    position: 'absolute', alignSelf: 'center', alignItems: 'center', gap: 10, backgroundColor: D.white, padding: 16, borderRadius: 20, ...softShadow, zIndex: 1000,
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
  until: { fontFamily: F.sans, fontSize: 17, color: D.ink60 },
  count: { fontFamily: F.sansSemi, fontSize: 13, color: D.ink, marginTop: 2 },
});
