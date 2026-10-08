import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import { Onest_400Regular, Onest_500Medium, Onest_600SemiBold } from '@expo-google-fonts/onest';
import { PlayfairDisplay_400Regular, PlayfairDisplay_400Regular_Italic } from '@expo-google-fonts/playfair-display';
import { useFonts } from 'expo-font';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import MapView from 'react-native-maps';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { DevelopingPhoto } from '@/components/proto/DevelopingPhoto';
import { RollingTime } from '@/components/proto/RollingTime';
import { BUCKETS, STEP_MIN, TimeScrubber } from '@/components/proto/TimeScrubber';
import { D, F, softShadow } from '@/lib/design';

// ПРОТОТИП: шкала времени на Исаакиевской площади, 14 июля 2024.
// Данные выдуманные — проверяем ощущение от анимации, а не загрузку.

const CENTER = { latitude: 59.9341, longitude: 30.3061 };
const REGION = { ...CENTER, latitudeDelta: 0.012, longitudeDelta: 0.012 };

// Когда люди снимают: утро, обед (пик), закат, ночь
const PEAKS: [number, number, number][] = [
  [9 * 60 + 50, 30, 6],
  [14 * 60 + 5, 45, 22],
  [19 * 60 + 40, 40, 16],
  [23 * 60 + 30, 25, 4],
];

type Mock = { id: number; minutes: number; lat: number; lng: number; uri: string };

function makeMocks(): Mock[] {
  let s = 42;
  const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;
  const list: Mock[] = [];
  let id = 0;
  for (const [mid, spread, n] of PEAKS) {
    for (let k = 0; k < n; k++) {
      const minutes = Math.max(0, Math.min(1439, Math.round(mid + gauss() * spread)));
      list.push({
        id: id,
        minutes,
        lat: CENTER.latitude + gauss() * 0.0032,
        lng: CENTER.longitude + gauss() * 0.0042,
        uri: `https://picsum.photos/id/${(id * 7 + 10) % 85}/200/200`,
      });
      id++;
    }
  }
  return list;
}

export default function TimePrototype() {
  const [fontsLoaded] = useFonts({
    PlayfairDisplay_400Regular,
    PlayfairDisplay_400Regular_Italic,
    Onest_400Regular,
    Onest_500Medium,
    Onest_600SemiBold,
    JetBrainsMono_500Medium,
  });
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const mocks = useMemo(makeMocks, []);
  const counts = useMemo(() => {
    const c = new Array(BUCKETS).fill(0);
    mocks.forEach((m) => c[Math.floor(m.minutes / STEP_MIN)]++);
    return c;
  }, [mocks]);

  const start = Math.floor((14 * 60) / STEP_MIN); // 14:00
  const [index, setIndex] = useState(start);
  const now = useSharedValue(start * STEP_MIN + STEP_MIN / 2);
  const indexSV = useSharedValue(start);
  // Высота карточки шкалы — фото раскладываем только выше неё
  const [sheetTop, setSheetTop] = useState(0);
  const ext = useMemo(() => {
    const lats = mocks.map((m) => m.lat), lngs = mocks.map((m) => m.lng);
    return { latMin: Math.min(...lats), latMax: Math.max(...lats), lngMin: Math.min(...lngs), lngMax: Math.max(...lngs) };
  }, [mocks]);
  const toPoint = (lat: number, lng: number) => {
    if (!sheetTop) return null;
    const top = insets.top + 64 + 40; // под верхней панелью (+ половина превью)
    const bottom = sheetTop - 58; // над карточкой (с запасом на подпись времени)
    const left = 40, right = width - 40;
    return {
      x: left + ((lng - ext.lngMin) / (ext.lngMax - ext.lngMin)) * (right - left),
      y: top + ((ext.latMax - lat) / (ext.latMax - ext.latMin)) * Math.max(0, bottom - top),
    };
  };

  const from = index * STEP_MIN;
  const inWindow = counts[index] ?? 0;
  const mood = inWindow === 0 ? 'никого' : inWindow < 3 ? 'тихо' : inWindow < 6 ? 'людно' : 'очень людно';

  // Слой фото не зависит от текущего интервала — перерисовывается только при смене границ карты
  const photoLayer = useMemo(
    () =>
      mocks.map((m) => {
        const p = toPoint(m.lat, m.lng);
        if (!p) return null;
        return <DevelopingPhoto key={m.id} uri={m.uri} minutes={m.minutes} x={p.x} y={p.y} now={now} />;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sheetTop, width, mocks, ext],
  );

  if (!fontsLoaded) {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={D.sun} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={REGION}
        mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        showsPointsOfInterests={false}
        toolbarEnabled={false}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: D.paper, opacity: 0.35 }]} pointerEvents="none" />

      {photoLayer}

      <View style={[styles.top, { top: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Icon name="back" size={20} color={D.ink} />
        </Pressable>
        <View style={styles.pill}>
          <Text style={styles.pillText}>Исаакиевская площадь</Text>
          <Text style={styles.pillTag}>ПРОТОТИП</Text>
        </View>
      </View>

      <View style={[styles.sheet, { bottom: insets.bottom + 12 }]} onLayout={(e) => setSheetTop(e.nativeEvent.layout.y)}>
        <TimeScrubber
          counts={counts}
          initialIndex={start}
          now={now}
          index={indexSV}
          onIndexChange={setIndex}
          header={
            <>
        <View style={styles.sheetHead}>
          <Text style={styles.date}>СБ, 14 ИЮЛЯ 2024</Text>
          <Text style={styles.step}>шаг 15 мин</Text>
        </View>
        <View style={styles.timeRow}>
          <RollingTime index={indexSV} step={STEP_MIN} size={54} />
          <View style={{ marginLeft: 12, marginTop: 10 }}>
            <Text style={styles.until}>–{String(Math.floor((from + STEP_MIN) / 60) % 24).padStart(2, '0')}:{String((from + STEP_MIN) % 60).padStart(2, '0')}</Text>
            <Text style={styles.count}>
              {inWindow} фото · {mood}
            </Text>
          </View>
        </View>
            </>
          }
          footer={<Text style={styles.hint}>Листайте шкалу — фото проявляются, когда время подходит к моменту съёмки</Text>}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: D.mapBase },
  top: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 1000, elevation: 30 },
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: D.white, alignItems: 'center', justifyContent: 'center', ...softShadow },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: D.white,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
    ...softShadow,
  },
  pillText: { fontFamily: F.sansMedium, fontSize: 15, color: D.ink },
  pillTag: { fontFamily: F.mono, fontSize: 10, color: D.sun, letterSpacing: 1 },
  sheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    backgroundColor: D.white,
    borderRadius: 28,
    paddingTop: 18,
    paddingBottom: 12,
    ...softShadow,
    zIndex: 1000,
    elevation: 30,
  },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20 },
  date: { fontFamily: F.mono, fontSize: 11, color: D.ink60, letterSpacing: 1.2 },
  step: { fontFamily: F.sansMedium, fontSize: 12, color: D.ink60 },
  timeRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginTop: 4, marginBottom: 10 },
  until: { fontFamily: F.sans, fontSize: 18, color: D.ink60 },
  count: { fontFamily: F.sansSemi, fontSize: 13, color: D.ink, marginTop: 2 },
  hint: { fontFamily: F.sans, fontSize: 12, color: D.ink40, textAlign: 'center', paddingHorizontal: 20 },
});
