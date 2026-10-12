// B1 · шторка «Последние моменты» (утверждено 12.10): где снимали недавно; ваш последний — первым, с меткой «ВАШ».
// Нажатие — карта летит туда, шкала — на это время. Закрыть — свайп вниз или нажатие на карту.
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
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
  const [list, setList] = useState<RecentMoment[] | null>(null);
  const [failed, setFailed] = useState(false);
  const drag = useSharedValue(0);

  useEffect(() => {
    fetchRecentMoments(6).then(setList).catch(() => setFailed(true));
  }, []);

  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .onUpdate((e) => {
      drag.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 90 || e.velocityY > 700) scheduleOnRN(onClose);
      else drag.value = withSpring(0, SHEET_SPRING);
    });
  const dragStyle = useAnimatedStyle(() => ({ transform: [{ translateY: drag.value }] }));

  return (
    <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(180)} style={styles.dim}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Закрыть" />
      <GestureDetector gesture={pan}>
        <Animated.View
          entering={SlideInDown.springify().damping(SHEET_SPRING.damping).stiffness(SHEET_SPRING.stiffness).mass(SHEET_SPRING.mass)}
          exiting={SlideOutDown.duration(200)}
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 18 }, dragStyle]}
        >
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
            <View style={styles.card}>
              {list.map((m, i) => {
                const t = new Date(m.bucket);
                const first = i === 0 && m.mine;
                return (
                  <View key={`${m.bucket}|${m.lat}|${m.lng}`}>
                    {i > 0 && <View style={styles.sep} />}
                    <Pressable
                      onPress={() => onPick(m)}
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
          )}
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  dim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(22,19,15,0.35)', justifyContent: 'flex-end', zIndex: 3000, elevation: 50 },
  sheet: { backgroundColor: D.paper, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 10, paddingHorizontal: 24 },
  grab: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: 'rgba(22,19,15,0.15)' },
  title: { marginTop: 18, fontFamily: F.serif, fontSize: 28, color: D.ink },
  intro: { marginTop: 6, fontFamily: F.sans, fontSize: 14, lineHeight: 20, color: D.ink60 },
  wait: { height: 120, alignItems: 'center', justifyContent: 'center' },
  card: { marginTop: 16, backgroundColor: D.white, borderRadius: 20 },
  sep: { height: 1, marginHorizontal: 8, backgroundColor: D.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 16, paddingRight: 14, paddingVertical: 12, minHeight: 68 },
  img: { width: 44, height: 44, borderRadius: 10, backgroundColor: D.paper2 },
  name: { fontFamily: F.sansSemi, fontSize: 15, color: D.ink },
  sub: { fontFamily: F.sans, fontSize: 13, color: D.ink60 },
});
