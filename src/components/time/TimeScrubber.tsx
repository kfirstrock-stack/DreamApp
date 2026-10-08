import * as Haptics from 'expo-haptics';
import { memo, useEffect, useMemo, type ReactNode } from 'react';
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
import { D, F, STEP_MIN } from '@/lib/design';

export const ITEM = 11; // шаг между столбиками, px
const BAR_W = 6;
const MAX_H = 52;

type Props = {
  counts: number[];
  initialIndex: number;
  now: SharedValue<number>; // текущее время, минуты от начала дня (дробное) — для проявления фото
  index: SharedValue<number>; // текущий интервал — для цифр времени
  onIndexChange: (i: number) => void;
  jumpTo?: { i: number; key: number } | null; // команда «переехать к интервалу»
  sidePadding?: number; // отступ карточки от краёв экрана
  header?: ReactNode;
  footer?: ReactNode;
  ticks?: { i: number; label: string }[]; // подписи под шкалой
};

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

// Шкала-гистограмма суток: едет за пальцем, после броска докатывается по инерции,
// тап по гистограмме — переход к моменту, щелчок вибрацией на каждом шаге.
export const TimeScrubber = memo(function TimeScrubber({
  counts, initialIndex, now, index, onIndexChange, jumpTo, sidePadding = 12, header, footer, ticks,
}: Props) {
  const BUCKETS = counts.length;
  const { width } = useWindowDimensions();
  const innerW = width - sidePadding * 2;
  const center = innerW / 2;
  const maxX = (BUCKETS - 1) * ITEM;
  const x = useSharedValue(initialIndex * ITEM);
  const startX = useSharedValue(0);
  const barsTop = useSharedValue(0);
  const moving = useSharedValue(false);
  const caught = useSharedValue(false);
  const max = Math.max(1, ...counts);
  const heights = useMemo(() => counts.map((c) => (c === 0 ? 3 : 8 + (c / max) * (MAX_H - 8))), [counts, max]);

  const auto = useSharedValue(false); // шкала едет сама (по команде) — без вибрации
  const tick = (i: number, quiet: boolean) => {
    if (!quiet) Haptics.selectionAsync().catch(() => {});
    onIndexChange(i);
  };

  useAnimatedReaction(
    () => Math.min(BUCKETS - 1, Math.max(0, Math.round(x.value / ITEM))),
    (i, prev) => {
      if (prev !== null && i !== prev) {
        index.value = i;
        scheduleOnRN(tick, i, auto.value);
      }
    },
  );
  useAnimatedReaction(
    () => x.value,
    (v) => {
      now.value = (v / ITEM) * STEP_MIN + STEP_MIN / 2;
    },
  );

  // Внешняя команда: переехать к интервалу (смена дня, «кто ещё был здесь»)
  useEffect(() => {
    if (!jumpTo) return;
    cancelAnimation(x);
    moving.value = true;
    auto.value = true;
    x.value = withSpring(jumpTo.i * ITEM, { damping: 26, stiffness: 120, mass: 1 }, (done) => {
      if (done) moving.value = false;
      auto.value = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpTo?.key]);

  const gesture = useMemo(() => {
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
        auto.value = false;
        caught.value = moving.value;
        cancelAnimation(x);
        moving.value = false;
        startX.value = x.value;
      })
      .onUpdate((e) => {
        const raw = startX.value - e.translationX;
        x.value = raw < 0 ? raw * 0.3 : raw > maxX ? maxX + (raw - maxX) * 0.3 : raw;
      })
      .onEnd((e) => {
        const v = -e.velocityX;
        if (Math.abs(v) < 60 || x.value < 0 || x.value > maxX) {
          settle();
          return;
        }
        moving.value = true;
        x.value = withDecay({ velocity: v, deceleration: 0.9975, clamp: [0, maxX], rubberBandEffect: true, rubberBandFactor: 0.6 }, (finished) => {
          if (finished) settle();
        });
      })
      .onFinalize((_e, success) => {
        if (!success && !moving.value) settle();
      });
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
          <Animated.View style={[styles.content, { width: BUCKETS * ITEM }, rowStyle]}>
            <View style={styles.bars}>
              {heights.map((h, i) => (
                <View key={i} style={styles.slot}>
                  <Bar i={i} h={h} x={x} />
                </View>
              ))}
            </View>
            <View style={styles.ticks}>
              {(ticks ?? Array.from({ length: 13 }, (_, k) => ({ i: k * 8, label: `${String(k * 2).padStart(2, '0')}:00` }))).map((t) => (
                <Text key={t.i} style={[styles.tick, { left: t.i * ITEM + ITEM / 2 - 20 }]}>
                  {t.label}
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
  wrap: { height: H + 28, overflow: 'hidden' },
  content: { position: 'absolute', left: 0, top: 0 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: H },
  slot: { width: ITEM, alignItems: 'center', justifyContent: 'flex-end' },
  bar: { width: BAR_W, borderRadius: 2, transformOrigin: 'bottom' },
  ticks: { height: 20, marginTop: 6 },
  tick: { position: 'absolute', width: 40, textAlign: 'center', fontFamily: F.mono, fontSize: 10, color: D.ink40 },
  marker: { position: 'absolute', top: 0, height: H + 4, left: 0, right: 0, alignItems: 'center' },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: D.sun },
  line: { width: 2, flex: 1, backgroundColor: D.sun, borderRadius: 1 },
});
