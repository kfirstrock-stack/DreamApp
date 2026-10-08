import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomBar } from '@/components/BottomBar';
import { CircleButton } from '@/components/CircleButton';
import { Mosaic } from '@/components/Mosaic';
import { PhotoMarker } from '@/components/PhotoMarker';
import { BUCKETS, TimeScale } from '@/components/TimeScale';
import { useAuth } from '@/lib/auth';
import { consumeMapFocus } from '@/lib/focus';
import { fetchPhotosInView, fetchTimeBuckets, photoUrl } from '@/lib/photos';
import { colors, shadow } from '@/lib/theme';
import { STEP_MS, bucketStart, bucketWindow, floorTo, indexFor, windowLabel, type Granularity } from '@/lib/time';
import type { Bounds, Photo } from '@/lib/types';

// Старт — Эйфелева башня, с неё всё началось
const START: Region = { latitude: 48.8584, longitude: 2.2945, latitudeDelta: 0.012, longitudeDelta: 0.012 };

const toBounds = (r: Region): Bounds => ({
  minLat: r.latitude - r.latitudeDelta / 2,
  maxLat: r.latitude + r.latitudeDelta / 2,
  minLng: r.longitude - r.longitudeDelta / 2,
  maxLng: r.longitude + r.longitudeDelta / 2,
});

// Серая карта как в макете (Android / Google Maps; на iPhone — mutedStandard)
const GREY_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#f2f2f2' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6b6b6b' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#e8e8e8' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#e2e2e2' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#cfdede' }] },
];

type Cluster = { key: string; lat: number; lng: number; photos: Photo[] };

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const mapRef = useRef<MapView>(null);

  const [view, setView] = useState<'map' | 'mosaic'>('map');
  const [region, setRegion] = useState<Region>(START);
  const [timeOn, setTimeOn] = useState(true);
  const [gran, setGran] = useState<Granularity>('day');
  const [anchor, setAnchor] = useState(() => floorTo(new Date(), 'day'));
  const [index, setIndex] = useState(0);
  const [counts, setCounts] = useState<Map<number, number>>(new Map());
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const autoJump = useRef(true); // один раз прыгаем к последнему интервалу, где есть фото

  const window = timeOn ? bucketWindow(anchor, gran, index) : null;
  const windowKey = window ? window.from.getTime() : 0;

  // Возврат на экран: обновляем данные и выполняем «перелёт», если его попросили
  useFocusEffect(
    useCallback(() => {
      const f = consumeMapFocus();
      if (f) {
        setView('map');
        const r = { latitude: f.lat, longitude: f.lng, latitudeDelta: 0.004, longitudeDelta: 0.004 };
        mapRef.current?.animateToRegion(r, 600);
        setRegion(r);
        if (f.at) {
          const a = floorTo(new Date(), '15min');
          autoJump.current = false;
          setTimeOn(true);
          setGran('15min');
          setAnchor(a);
          setIndex(Math.min(BUCKETS - 1, indexFor(a, '15min', f.at)));
        }
      }
      setReloadKey((k) => k + 1);
    }, []),
  );

  // Если доступ к геопозиции уже дан — начинаем с текущего места
  useEffect(() => {
    (async () => {
      const perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted) return;
      const pos = await Location.getLastKnownPositionAsync();
      if (!pos) return;
      const r = { latitude: pos.coords.latitude, longitude: pos.coords.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 };
      mapRef.current?.animateToRegion(r, 0);
      setRegion(r);
    })();
  }, []);

  // Фото в видимой области за выбранный интервал
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const list = await fetchPhotosInView(toBounds(region), window);
        if (!cancelled) {
          setPhotos(list);
          setError(null);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Не удалось загрузить фото');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region, timeOn, windowKey, reloadKey]);

  // Плотность фото по интервалам — для подсветки пузырьков шкалы
  useEffect(() => {
    if (!timeOn) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const to = new Date(anchor.getTime() + STEP_MS[gran]);
        const from = bucketStart(anchor, gran, BUCKETS - 1);
        const map = await fetchTimeBuckets(toBounds(region), gran, from, to, anchor);
        if (cancelled) return;
        setCounts(map);
        if (autoJump.current && map.size > 0) {
          autoJump.current = false;
          if (!map.get(anchor.getTime())) {
            const latest = Math.max(...map.keys());
            setIndex(Math.round((anchor.getTime() - latest) / STEP_MS[gran]));
          }
        }
      } catch {
        /* шкала просто останется без подсветки */
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [region, timeOn, gran, anchor, reloadKey]);

  // Меняем шаг шкалы, сохраняя выбранный момент
  const changeGranularity = (g: Granularity) => {
    if (g === gran) return;
    const moment = window?.from ?? new Date();
    const a = floorTo(new Date(), g);
    setGran(g);
    setAnchor(a);
    setCounts(new Map());
    setIndex(Math.min(BUCKETS - 1, indexFor(a, g, moment)));
  };

  // Группируем близкие фото в «стопки» по сетке, зависящей от масштаба карты
  const clusters = useMemo<Cluster[]>(() => {
    const cellLat = region.latitudeDelta / 7;
    const cellLng = region.longitudeDelta / 5;
    const map = new Map<string, Cluster>();
    for (const p of photos) {
      const key = `${Math.floor(p.lat / cellLat)}:${Math.floor(p.lng / cellLng)}`;
      const c = map.get(key);
      if (c) c.photos.push(p);
      else map.set(key, { key, lat: p.lat, lng: p.lng, photos: [p] });
    }
    return [...map.values()];
  }, [photos, region.latitudeDelta, region.longitudeDelta]);

  const openCluster = (c: Cluster) => {
    if (c.photos.length === 1) router.push({ pathname: '/photo/[id]', params: { id: c.photos[0].id } });
    else router.push({ pathname: '/stack', params: { ids: c.photos.map((p) => p.id).join(',') } });
  };

  const locateMe = async () => {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    mapRef.current?.animateToRegion(
      { latitude: pos.coords.latitude, longitude: pos.coords.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 },
      600,
    );
  };

  const goAdd = () => router.push(session ? '/add' : '/sign-in');
  const goProfile = () => router.push(session ? '/profile' : '/sign-in');

  const bottomSpace = Math.max(insets.bottom, 12) + 64;
  const scaleHeight = timeOn ? 128 : 0;

  return (
    <View style={styles.root}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={START}
        onRegionChangeComplete={setRegion}
        mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
        customMapStyle={GREY_STYLE}
        showsUserLocation
        showsMyLocationButton={false}
        toolbarEnabled={false}
        pitchEnabled={false}
      >
        {view === 'map' &&
          clusters.map((c) => (
            <PhotoMarker
              key={c.key + c.photos[0].id}
              lat={c.lat}
              lng={c.lng}
              url={photoUrl(c.photos[0].storage_path)}
              count={c.photos.length}
              onPress={() => openCluster(c)}
            />
          ))}
      </MapView>

      {view === 'mosaic' && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]}>
          <Mosaic
            photos={photos}
            onOpen={(p) => router.push({ pathname: '/photo/[id]', params: { id: p.id } })}
            topInset={insets.top + 64}
            bottomInset={bottomSpace + scaleHeight + 16}
            empty={<EmptyHint onAdd={goAdd} />}
          />
        </View>
      )}

      {/* Верхняя плашка: что сейчас показано */}
      <View style={[styles.top, { top: insets.top + 8 }]} pointerEvents="box-none">
        <View style={styles.pill}>
          {loading ? <ActivityIndicator size="small" color={colors.teal} /> : null}
          <Text style={styles.pillText} numberOfLines={1}>
            {error
              ? 'Нет связи с сервером'
              : window
                ? `${windowLabel(window.from, window.to, gran)} · ${photos.length} фото`
                : `За всё время · ${photos.length} фото`}
          </Text>
        </View>
      </View>

      {/* Правая колонка кнопок */}
      <View style={[styles.side, { top: insets.top + 60 }]}>
        <CircleButton
          icon="clock"
          size={44}
          active={timeOn}
          onPress={() => setTimeOn((v) => !v)}
          accessibilityLabel="Шкала времени"
        />
        {view === 'map' && <CircleButton icon="locate" size={44} onPress={locateMe} accessibilityLabel="Где я" />}
      </View>

      {view === 'map' && !loading && !error && photos.length === 0 && (
        <View style={[styles.emptyMap, { top: insets.top + 60 }]} pointerEvents="box-none">
          <EmptyHint onAdd={goAdd} compact />
        </View>
      )}

      {timeOn && (
        <View style={[styles.scale, { bottom: bottomSpace + 4 }]} pointerEvents="box-none">
          <TimeScale
            anchor={anchor}
            granularity={gran}
            index={index}
            counts={counts}
            onIndexChange={setIndex}
            onGranularityChange={changeGranularity}
          />
        </View>
      )}

      <BottomBar
        active={view}
        onMap={() => setView('map')}
        onMosaic={() => setView('mosaic')}
        onAdd={goAdd}
        onProfile={goProfile}
        onMenu={() => router.push('/menu')}
      />
    </View>
  );
}

function EmptyHint({ onAdd, compact }: { onAdd: () => void; compact?: boolean }) {
  return (
    <View style={[styles.empty, compact && { paddingVertical: 12 }]}>
      <Text style={styles.emptyTitle}>Здесь пока нет фото{compact ? '' : ' за это время'}</Text>
      <Text style={styles.emptyText}>Сдвиньте карту, выберите другое время или станьте первым.</Text>
      <Pressable onPress={onAdd} style={styles.emptyBtn}>
        <Text style={styles.emptyBtnText}>Добавить фото</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  top: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: '100%',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.95)',
    ...shadow,
  },
  pillText: { fontSize: 13, fontWeight: '600', color: colors.text, flexShrink: 1 },
  side: { position: 'absolute', right: 14, gap: 12 },
  scale: { position: 'absolute', left: 0, right: 0 },
  emptyMap: { position: 'absolute', left: 24, right: 72 },
  empty: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    gap: 6,
    ...shadow,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.text, textAlign: 'center' },
  emptyText: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  emptyBtn: { marginTop: 6, backgroundColor: colors.teal, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999 },
  emptyBtnText: { color: colors.white, fontWeight: '700', fontSize: 14 },
});
