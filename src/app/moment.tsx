import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { RoundButton } from '@/components/ui/RoundButton';
import { TAB_BAR_SPACE, TabBar } from '@/components/ui/TabBar';
import { useAuth } from '@/lib/auth';
import { D, F, STEP_MIN, lightShadow } from '@/lib/design';
import { requestMapFocus } from '@/lib/focus';
import { boundsAround, fetchPhotosV2, photoUrl } from '@/lib/photos';
import type { Photo } from '@/lib/types';

const STEP = STEP_MIN * 60000;
const pad = (n: number) => String(n).padStart(2, '0');
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const MON = ['ЯНВ', 'ФЕВ', 'МАР', 'АПР', 'МАЯ', 'ИЮН', 'ИЮЛ', 'АВГ', 'СЕН', 'ОКТ', 'НОЯ', 'ДЕК'];

// B5 · Лента момента: все фото места за 15 минут, соседние интервалы — чипами
export default function MomentScreen() {
  const params = useLocalSearchParams<{ lat: string; lng: string; radius?: string; from: string; title?: string }>();
  const lat = Number(params.lat), lng = Number(params.lng);
  const radius = Number(params.radius ?? 120);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { session } = useAuth();
  const [start, setStart] = useState(Number(params.from));
  const [photos, setPhotos] = useState<Photo[] | null>(null);

  // Берём ±30 минут вокруг, чтобы сразу показать счётчики соседних интервалов
  useEffect(() => {
    let cancelled = false;
    fetchPhotosV2(boundsAround(lat, lng, radius), new Date(start - 2 * STEP), new Date(start + 3 * STEP), 500)
      .then((list) => !cancelled && setPhotos(list))
      .catch(() => !cancelled && setPhotos([]));
    return () => {
      cancelled = true;
    };
  }, [lat, lng, radius, start]);

  const windows = useMemo(
    () =>
      [-2, -1, 0, 1, 2].map((k) => {
        const s = start + k * STEP;
        const n = (photos ?? []).filter((p) => {
          const t = new Date(p.taken_at).getTime();
          return t >= s && t < s + STEP;
        }).length;
        return { k, s, n };
      }),
    [photos, start],
  );
  const inWindow = useMemo(
    () =>
      (photos ?? [])
        .filter((p) => {
          const t = new Date(p.taken_at).getTime();
          return t >= start && t < start + STEP;
        })
        .sort((a, b) => +new Date(a.taken_at) - +new Date(b.taken_at)),
    [photos, start],
  );

  const title = params.title || inWindow[0]?.place_name || photos?.[0]?.place_name || 'Это место';
  const s = new Date(start), e = new Date(start + STEP);
  const meta = `${s.getDate()} ${MON[s.getMonth()]} ${s.getFullYear()} · ${hm(s)}–${hm(e)} · ${inWindow.length} ФОТО`;

  // Две колонки разной высоты — раскладываем по самой короткой
  const gap = 12;
  const colW = (width - 40 - gap) / 2;
  const cols: { p: Photo; h: number; i: number }[][] = [[], []];
  const hs = [0, 0];
  inWindow.forEach((p, i) => {
    const ratio = p.width && p.height ? p.height / p.width : 1.25;
    const h = Math.min(Math.max(colW * ratio, colW * 0.8), colW * 1.5);
    const c = hs[0] <= hs[1] ? 0 : 1;
    cols[c].push({ p, h, i });
    hs[c] += h + gap;
  });

  const showOnMap = () => {
    requestMapFocus({ lat, lng, at: new Date(start + STEP / 2) });
    router.dismissTo('/');
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + TAB_BAR_SPACE + 30 }} showsVerticalScrollIndicator={false}>
        <View style={styles.headRow}>
          <RoundButton icon="back" label="Назад" onPress={() => router.back()} />
          <RoundButton icon="map" label="Показать на карте" onPress={showOnMap} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.meta}>{meta}</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {windows.map((w) => {
            const on = w.k === 0;
            return (
              <Pressable key={w.s} onPress={() => setStart(w.s)} style={[styles.chip, on && styles.chipOn]}>
                <Text style={[styles.chipTime, on && { color: D.paper }]}>{hm(new Date(w.s))}</Text>
                <Text style={[styles.chipCount, { color: on ? D.sun : D.ink40 }]}>{w.n}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {photos !== null && inWindow.length === 0 && (
          <Animated.Text entering={FadeIn} style={styles.empty}>
            В эти 15 минут здесь никого. Загляните в соседние интервалы — они выше.
          </Animated.Text>
        )}

        {/* Ключ по интервалу: при смене времени карточки заново «раскладываются» веером */}
        <View key={start} style={[styles.grid, { gap }]}>
          {cols.map((col, ci) => (
            <View key={ci} style={{ width: colW, gap }}>
              {col.map(({ p, h, i }) => (
                <Animated.View
                  key={p.id}
                  entering={FadeInDown.delay(Math.min(i, 10) * 45).springify().damping(17).stiffness(170)}
                  layout={LinearTransition}
                >
                  <Pressable onPress={() => router.push({ pathname: '/photo/[id]', params: { id: p.id } })} style={[styles.card, { height: h }]}>
                    <Image source={{ uri: photoUrl(p.storage_path) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} recyclingKey={p.id} />
                    <View style={styles.cardMeta}>
                      {p.author_avatar ? <Image source={{ uri: p.author_avatar }} style={styles.ava} /> : <View style={[styles.ava, { backgroundColor: D.sun }]} />}
                      <Text style={styles.cardTime}>{hm(new Date(p.taken_at))}</Text>
                    </View>
                    {(p.like_count ?? 0) > 0 && (
                      <View style={styles.likes}>
                        <Icon name={p.liked_by_me ? 'heartFill' : 'heart'} size={12} color={p.liked_by_me ? D.sun : D.white} />
                        <Text style={styles.likesText}>{p.like_count}</Text>
                      </View>
                    )}
                  </Pressable>
                </Animated.View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>

      <TabBar
        active="moments"
        onMap={() => router.dismissTo('/')}
        onMoments={() => {}}
        onAdd={() => router.push(session ? '/add' : '/sign-in')}
        onProfile={() => router.push(session ? '/profile' : '/sign-in')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: D.paper },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16 },
  title: { fontFamily: F.serifItalic, fontSize: 31, lineHeight: 38, color: D.ink, paddingHorizontal: 20, marginTop: 16 },
  meta: { fontFamily: F.mono, fontSize: 11, color: D.ink60, letterSpacing: 0.8, paddingHorizontal: 20, marginTop: 6 },
  chips: { gap: 8, paddingHorizontal: 20, paddingVertical: 16 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: D.white, borderWidth: 1, borderColor: D.line },
  chipOn: { backgroundColor: D.ink, borderColor: D.ink },
  chipTime: { fontFamily: F.mono, fontSize: 13, color: D.ink },
  chipCount: { fontFamily: F.sans, fontSize: 12 },
  empty: { fontFamily: F.sans, fontSize: 15, lineHeight: 22, color: D.ink60, paddingHorizontal: 20, marginTop: 8 },
  grid: { flexDirection: 'row', paddingHorizontal: 20 },
  card: { borderRadius: 18, overflow: 'hidden', backgroundColor: D.paper2, ...lightShadow },
  cardMeta: { position: 'absolute', left: 8, bottom: 8, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(22,19,15,0.55)', borderRadius: 999, paddingLeft: 3, paddingRight: 9, paddingVertical: 3 },
  ava: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: D.white },
  cardTime: { fontFamily: F.mono, fontSize: 11, color: D.white },
  likes: { position: 'absolute', right: 8, bottom: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(22,19,15,0.55)', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3 },
  likesText: { fontFamily: F.mono, fontSize: 10, color: D.white },
});
