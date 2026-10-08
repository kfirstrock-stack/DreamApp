import * as Haptics from 'expo-haptics';
import { memo, useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { D, F } from '@/lib/design';

export const STEP_MIN = 15;
export const BUCKETS = (24 * 60) / STEP_MIN; // 96 интервалов в сутках
export const ITEM = 11; // шаг между столбиками, px
const BAR_W = 6;
const MAX_H = 58;

type Props = {
  counts: number[];
  initialIndex: number;
  now: SharedValue<number>; // текущее время, минуты (дробное) — для проявления фото
  index: SharedValue<number>; // текущий интервал — для цифр времени
  onIndexChange: (i: number) => void;
  header?: ReactNode; // всё, что выше гистограммы, — тоже зона жеста
  footer?: ReactNode;
};

// Столбик: «линза» у центра через scaleY (без пересчёта раскладки), выбранный — оранжевый
const Bar = memo(function Bar({ i, h, x }: { i: number; h: number; x: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const d = Math.abs(x.value / ITEM - i);
    const lens = d < 4 ? 1 - d / 4 : 0;
    return {
      transform: [{ scaleY: 1 + 0.3 * lens }],
      backgroundColor: d < 0.5 ? D.sun : 'rgba(22,19,15,0.17)',
    };
  });
  return <Animated.View style={[styles.bar, { height: h }, style]} />;
});

// Шкала-гистограмма: едет за пальцем без задержки, после броска докатывается до ближайших 15 минут.
// Тап по гистограмме — сразу туда. На каждом шаге — щелчок вибрацией.
export const TimeScrubber = memo(function TimeScrubber({ counts, initialIndex, now, index, onIndexChange, header, footer }: Props) {
  const { width } = useWindowDimensions();
  const innerW = width - 24; // ширина карточки шкалы
  const center = innerW / 2;
  const maxX = (BUCKETS - 1) * ITEM;
  const x = useSharedValue(initialIndex * ITEM);
  const startX = useSharedValue(0);
  const barsTop = useSharedValue(0);
  const moving = useSharedValue(false); // шкала ещё катится
  const caught = useSharedValue(false); // касание остановило движущуюся шкалу
  const max = Math.max(1, ...counts);
  const heights = useMemo(() => counts.map((c) => (c === 0 ? 3 : 8 + (c / max) * (MAX_H - 8))), [counts, max]);

  const tick = (i: number) => {
    Haptics.selectionAsync().catch(() => {});
    onIndexChange(i);
  };

  useAnimatedReaction(
    () => Math.min(BUCKETS - 1, Math.max(0, Math.round(x.value / ITEM))),
    (i, prev) => {
      if (prev !== null && i !== prev) {
        index.value = i;
        scheduleOnRN(tick, i);
      }
    },
  );
  useAnimatedReaction(
    () => x.value,
    (v) => {
      now.value = (v / ITEM) * STEP_MIN + STEP_MIN / 2;
    },
  );

  // Жест создаётся один раз: если пересоздавать его при каждой перерисовке,
  // система «теряет» касание, и шкалу приходится тянуть по нескольку раз.
  const gesture = useMemo(() => {
    // Мягкая доводка до ближайшего интервала — сдвиг максимум на полшага (5 px)
    const settle = () => {
      'worklet';
      const t = Math.min(maxX, Math.max(0, Math.round(x.value / ITEM) * ITEM));
      moving.value = true;
      x.value = withSpring(t, { damping: 30, stiffness: 260, mass: 0.6 }, (done) => {
        if (done) moving.value = false;
      });
    };

    const pan = Gesture.Pan()
      .minDistance(1)
      .onBegin(() => {
        caught.value = moving.value; // касание движущейся шкалы — просто «поймать»
        cancelAnimation(x);
        moving.value = false;
        startX.value = x.value;
      })
      .onUpdate((e) => {
        const raw = startX.value - e.translationX;
        x.value = raw < 0 ? raw * 0.3 : raw > maxX ? maxX + (raw - maxX) * 0.3 : raw; // «резинка» на краях
      })
      .onEnd((e) => {
        const v = -e.velocityX;
        if (Math.abs(v) < 60 || x.value < 0 || x.value > maxX) {
          settle();
          return;
        }
        // Свободная инерция без «прилипания», доводка — только в самом конце
        moving.value = true;
        x.value = withDecay({ velocity: v, deceleration: 0.9975, clamp: [0, maxX], rubberBandEffect: true, rubberBandFactor: 0.6 }, (finished) => {
          if (finished) settle();
        });
      })
      .onFinalize((_e, success) => {
        // палец просто коснулся и отпустил (без прокрутки) — доводим, если остановили на полпути
        if (!success && !moving.value) settle();
      });

    // Тап по гистограмме — переехать в это время. Только если палец не двигался
    // и шкала в этот момент не катилась (иначе это «поймать», а не «перейти»).
    const tap = Gesture.Tap()
      .maxDuration(250)
      .maxDistance(6)
      .onEnd((e) => {
        if (caught.value || e.y < barsTop.value) return;
        const t = Math.min(maxX, Math.max(0, Math.round((x.value + (e.x - center)) / ITEM) * ITEM));
        moving.value = true;
        x.value = withSpring(t, { damping: 26, stiffness: 180, mass: 0.8 }, (done) => {
          if (done) moving.value = false;
        });
      });

    return Gesture.Exclusive(pan, tap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxX, center]);

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: center - ITEM / 2 - x.value }] }));

  return (
    <GestureDetector gesture={gesture}>
      <View collapsable={false}>
        {header}
        <View style={styles.wrap} onLayout={(e) => (barsTop.value = e.nativeEvent.layout.y)}>
          <Animated.View style={[styles.content, rowStyle]}>
            <View style={styles.bars}>
              {heights.map((h, i) => (
                <View key={i} style={styles.slot}>
                  <Bar i={i} h={h} x={x} />
                </View>
              ))}
            </View>
            <View style={styles.ticks}>
              {Array.from({ length: 13 }, (_, k) => (
                <Text key={k} style={[styles.tick, { left: k * 8 * ITEM + ITEM / 2 - 20 }]}>
                  {String(k * 2).padStart(2, '0')}:00
                </Text>
              ))}
            </View>
          </Animated.View>
          <View pointerEvents="none" style={styles.marker}>
            <View style={styles.dot} />
            <View style={styles.line} />
          </View>
        </View>
        {footer}
      </View>
    </GestureDetector>
  );
});

const H = Math.round(MAX_H * 1.3) + 4;
const styles = StyleSheet.create({
  wrap: { height: H + 30, overflow: 'hidden' },
  content: { position: 'absolute', left: 0, top: 0, width: BUCKETS * ITEM },
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: H },
  slot: { width: ITEM, alignItems: 'center', justifyContent: 'flex-end' },
  bar: { width: BAR_W, borderRadius: 2, transformOrigin: 'bottom' },
  ticks: { height: 20, marginTop: 6 },
  tick: { position: 'absolute', width: 40, textAlign: 'center', fontFamily: F.mono, fontSize: 10, color: D.ink40 },
  marker: { position: 'absolute', top: 0, height: H + 4, left: 0, right: 0, alignItems: 'center' },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: D.sun },
  line: { width: 2, flex: 1, backgroundColor: D.sun, borderRadius: 1 },
});
