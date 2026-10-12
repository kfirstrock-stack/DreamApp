// B1 · шторка «Последние моменты» (утверждено 12.10): где снимали недавно; ваш последний — первым, с меткой «ВАШ».
// Нажатие — карта летит туда, шкала — на это время. Закрыть — свайп вниз или нажатие на карту.
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { D, F, SHEET_SPRING } from '@/lib/design';
import { fetchRecentMoments, photoSource, type RecentMoment } from '@/lib/photos';

const MON = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const pad = (n: number) => String(n).padStart(2, '0');
/** «12 окт, 00:00»; в другой год — «2 авг 2025, 12:30» */
const when = (d: Date) =>
  `${d.getDate()} ${MON[d.getMonth()]}${d.getFullYear() === new Date().getFullYear() ? '' : ` ${d.getFullYear()}`}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
const photos = (n: number) => `${n} фото`;

export function RecentSheet({ onClose, onPick }: { onClose: () => void; onPick: (m: RecentMoment) => void }) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [list, setList] = useState<RecentMoment[] | null>(null);
  const [failed, setFailed] = useState(false);
  // Появление и уход — своя анимация (12.10): встроенная SlideInDown на карте обрывалась, и шторка застревала на полпути
  const y = useSharedValue(height); // сдвиг шторки вниз: height — за экраном, 0 — на месте
  const shade = useSharedValue(0);
  const closing = useSharedValue(false);

  useEffect(() => {
    y.value = withSpring(0, SHEET_SPRING);
    shade.value = withTiming(1, { duration: 180 });
    fetchRecentMoments(6).then(setList).catch(() => setFailed(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // закрываем с JS-потока: увели шторку вниз и через время анимации сообщили родителю
  const close = (then?: () => void) => {
    if (closing.value) return;
    closing.value = true;
    shade.value = withTiming(0, { duration: 200 });
    y.value = withTiming(height, { duration: 220 });
    setTimeout(then ?? onClose, 230);
  };
  const closeBySwipe = () => close();

  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .onUpdate((e) => {
      if (!closing.value) y.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 90 || e.velocityY > 700) scheduleOnRN(closeBySwipe);
      else y.value = withSpring(0, SHEET_SPRING);
    });
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const dimStyle = useAnimatedStyle(() => ({ opacity: shade.value }));

  return (
    <View style={styles.wrap}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.dim, dimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => close()} accessibilityLabel="Закрыть" />
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 18, maxHeight: height - insets.top - 40 }, sheetStyle]}>
          <View style={styles.grab} />
          <Text style={styles.title}>Последние моменты</Text>
          <Text style={styles.intro}>Где снимали недавно — нажмите, чтобы перенестись туда и в то время.</Text>
          {list == null ? (
            <View style={styles.wait}>
              {failed ? <Text style={styles.intro}>Не получилось загрузить. Проверьте интернет.</Text> : <ActivityIndicator color={D.ink60} />}
            </View>
          ) : list.length === 0 ? (
            <Text style={[styles.intro, { marginTop: 16 }]}>Пока никто ничего не снимал.</Text>
          ) : (
            <ScrollView style={styles.scroll} bounces={false} showsVerticalScrollIndicator={false}>
            <View style={styles.card}>
              {list.map((m, i) => {
                const t = new Date(m.bucket);
                const first = i === 0 && m.mine;
                return (
                  <View key={`${m.bucket}|${m.lat}|${m.lng}`}>
                    {i > 0 && <View style={styles.sep} />}
                    <Pressable
                      onPress={() => close(() => onPick(m))}
                      style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
                      accessibilityLabel={`${first ? 'Ваш последний момент: ' : ''}${m.place_name ?? 'Место'}, ${when(t)}, ${photos(m.photo_count)}`}
                    >
                      <Image source={photoSource(m.cover_path)} style={styles.img} contentFit="cover" />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={styles.name} numberOfLines={1}>
                          {m.place_name ?? 'Место без названия'}
                        </Text>
                        <Text style={styles.sub} numberOfLines={1}>
                          {first ? <Text style={{ color: D.sun }}>ВАШ · </Text> : null}
                          {when(t)} · {photos(m.photo_count)}
                        </Text>
                      </View>
                      <Icon name="chevR" size={18} color={D.ink40} />
                    </Pressable>
                  </View>
                );
              })}
            </View>
            </ScrollView>
          )}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end', zIndex: 3000, elevation: 50 },
  dim: { backgroundColor: 'rgba(22,19,15,0.35)' },
  sheet: { backgroundColor: D.paper, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 10, paddingHorizontal: 24 },
  grab: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: 'rgba(22,19,15,0.15)' },
  title: { marginTop: 18, fontFamily: F.serif, fontSize: 28, color: D.ink },
  intro: { marginTop: 6, fontFamily: F.sans, fontSize: 14, lineHeight: 20, color: D.ink60 },
  wait: { height: 120, alignItems: 'center', justifyContent: 'center' },
  scroll: { flexGrow: 0, flexShrink: 1, marginTop: 16 },
  card: { backgroundColor: D.white, borderRadius: 20 },
  sep: { height: 1, marginHorizontal: 8, backgroundColor: D.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 16, paddingRight: 14, paddingVertical: 12, minHeight: 68 },
  img: { width: 44, height: 44, borderRadius: 10, backgroundColor: D.paper2 },
  name: { fontFamily: F.sansSemi, fontSize: 15, color: D.ink },
  sub: { fontFamily: F.sans, fontSize: 13, color: D.ink60 },
});
