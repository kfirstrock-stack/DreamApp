import * as Haptics from 'expo-haptics';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
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
const INSET = 20;

// Бесконечная шкала (утверждено 12.10): в шкале сразу три диапазона — предыдущий, текущий и следующий
// (если он не в будущем). Положение x — в столбиках ТЕКУЩЕГО диапазона: минус — предыдущий, ≥ curLen — следующий.
// Перешли границу — родитель делает соседний диапазон текущим и присылает shift: шкала незаметно
// пересчитывает x, движение пальца и инерция продолжаются без рывка.
type Props = {
  counts: number[]; // столбики всех трёх диапазонов подряд
  offset: number; // сколько столбиков предыдущего диапазона стоит перед текущим
  curLen: number; // столбиков в текущем диапазоне
  shift?: { by: number; key: number } | null; // текущий диапазон сменился: сдвинуть x на by столбиков
  initialIndex: number; // в столбиках текущего диапазона
  onSettle?: () => void; // шкала остановилась (после пальца, инерции, тапа или команды)
  now: SharedValue<number>; // текущее время, минуты от начала дня (дробное) — для проявления фото
  index: SharedValue<number>; // текущий интервал — для цифр времени
  onIndexChange: (i: number) => void;
  jumpTo?: { i: number; key: number } | null; // команда «переехать к интервалу»
  sidePadding?: number; // отступ карточки от краёв экрана
  header?: ReactNode;
  footer?: ReactNode;
  ticks?: { i: number; label: string }[]; // подписи под шкалой
  compact?: boolean; // S2: тонкие столбики 24 пт без подписей
};

const Bar = memo(function Bar({ i, h, w, x, off }: { i: number; h: number; w: number; x: SharedValue<number>; off: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const d = Math.abs(x.value / ITEM + off.value - i);
    const lens = d < 4 ? 1 - d / 4 : 0;
    return {
      transform: [{ scaleY: 1 + 0.3 * lens }],
      backgroundColor: d < 0.5 ? D.sun : 'rgba(22,19,15,0.17)',
    };
  });
  return <Animated.View style={[styles.bar, { height: h, width: w, borderRadius: Math.min(2, w / 2) }, style]} />;
});

// Шкала-гистограмма суток: едет за пальцем, после броска докатывается по инерции,
// тап по гистограмме — переход к моменту, щелчок вибрацией на каждом шаге.
export const TimeScrubber = memo(function TimeScrubber({
  counts, offset, curLen, shift, initialIndex, onSettle, now, index, onIndexChange, jumpTo, sidePadding = 12, header, footer, ticks, compact = false,
}: Props) {
  const maxH = compact ? 20 : MAX_H;
  const barW = compact ? 4 : BAR_W;
  const H = compact ? 24 : H_FULL;
  const BUCKETS = counts.length;
  const { width } = useWindowDimensions();
  const innerW = width - sidePadding * 2 - INSET * 2; // B1: шкала с отступом 20 от краёв карточки
  const center = innerW / 2;
  const minX = -offset * ITEM; // начало предыдущего диапазона
  const maxX = (BUCKETS - offset - 1) * ITEM; // конец следующего (или текущего, если следующий в будущем)
  const x = useSharedValue(initialIndex * ITEM);
  const off = useSharedValue(offset);
  const lenSV = useSharedValue(curLen);
  const startX = useSharedValue(0);
  const barsTop = useSharedValue(0);
  const moving = useSharedValue(false);
  const caught = useSharedValue(false);
  const max = Math.max(1, ...counts);
  const heights = useMemo(() => counts.map((c) => (c === 0 ? (compact ? 2 : 3) : (compact ? 5 : 8) + (c / max) * (maxH - (compact ? 5 : 8)))), [counts, max, maxH, compact]);

  const auto = useSharedValue(false); // шкала едет сама (по команде) — без вибрации
  const settleRef = useRef(onSettle);
  settleRef.current = onSettle;
  const settled = () => settleRef.current?.();
  const tick = (i: number, quiet: boolean) => {
    if (!quiet) Haptics.selectionAsync().catch(() => {});
    onIndexChange(i);
  };

  // смена диапазона: новый offset и сдвиг x — одним кадром, чтобы картинка не дёрнулась
  useLayoutEffect(() => {
    off.value = offset;
    lenSV.value = curLen;
    if (shift) {
      x.value = x.value + shift.by * ITEM;
      startX.value = startX.value + shift.by * ITEM;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset, curLen, shift?.key]);

  useAnimatedReaction(
    () => Math.round(x.value / ITEM),
    (i, prev) => {
      if (prev !== null && i !== prev) {
        // для цифр — время внутри своего диапазона (у соседнего — со своего конца/начала)
        index.value = i < 0 ? i + off.value : i >= lenSV.value ? i - lenSV.value : i;
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
      if (done) {
        moving.value = false;
        scheduleOnRN(settled);
      }
      auto.value = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpTo?.key]);

  const gesture = useMemo(() => {
    const settle = () => {
      'worklet';
      const t = Math.min(maxX, Math.max(minX, Math.round(x.value / ITEM) * ITEM));
      moving.value = true;
      x.value = withSpring(t, { damping: 30, stiffness: 260, mass: 0.6 }, (done) => {
        if (done) {
          moving.value = false;
          scheduleOnRN(settled);
        }
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
        x.value = raw < minX ? minX + (raw - minX) * 0.3 : raw > maxX ? maxX + (raw - maxX) * 0.3 : raw;
      })
      .onEnd((e) => {
        const v = -e.velocityX;
        if (Math.abs(v) < 60 || x.value < minX || x.value > maxX) {
          settle();
          return;
        }
        moving.value = true;
        x.value = withDecay({ velocity: v, deceleration: 0.9975, clamp: [minX, maxX], rubberBandEffect: true, rubberBandFactor: 0.6 }, (finished) => {
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
        const t = Math.min(maxX, Math.max(minX, Math.round((x.value + (e.x - INSET - center)) / ITEM) * ITEM));
        moving.value = true;
        x.value = withSpring(t, { damping: 26, stiffness: 180, mass: 0.8 }, (done) => {
          if (done) {
          moving.value = false;
          scheduleOnRN(settled);
        }
        });
      });
    return Gesture.Exclusive(pan, tap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minX, maxX, center]);

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: center - ITEM / 2 - x.value - off.value * ITEM }] }));

  return (
    <GestureDetector gesture={gesture}>
      <View collapsable={false}>
        {header}
        <View style={[styles.wrap, { height: compact ? H + 10 : H + 28 }]} onLayout={(e) => (barsTop.value = e.nativeEvent.layout.y)}>
          {/* T2 · «окно интервала»: мягкая капсула под выбранным столбиком, на всю высоту шкалы */}
          <View pointerEvents="none" style={[styles.window, { top: 6 + H - maxH - 6, height: maxH + 9, width: compact ? 11 : 13, borderRadius: compact ? 5.5 : 6.5, left: center - (compact ? 5.5 : 6.5) }]} />
          <Animated.View style={[styles.content, { width: BUCKETS * ITEM }, rowStyle]}>
            <View style={[styles.bars, { height: H, marginTop: 6 }]}>
              {heights.map((h, i) => (
                <View key={i} style={styles.slot}>
                  <Bar i={i} h={h} w={barW} x={x} off={off} />
                </View>
              ))}
            </View>
            {!compact && <View style={styles.ticks}>
              {(ticks ?? Array.from({ length: 13 }, (_, k) => ({ i: k * 8, label: `${String(k * 2).padStart(2, '0')}:00` }))).map((t) => (
                <Text key={t.i} style={[styles.tick, { left: t.i * ITEM + ITEM / 2 - 20 }]}>
                  {t.label}
                </Text>
              ))}
            </View>}
          </Animated.View>
        </View>
        {footer}
      </View>
    </GestureDetector>
  );
});

const H_FULL = Math.round(MAX_H * 1.3) + 4;
const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', marginHorizontal: INSET },
  window: { position: 'absolute', top: 0, backgroundColor: 'rgba(255,90,54,0.12)' },
  content: { position: 'absolute', left: 0, top: 0 },
  bars: { flexDirection: 'row', alignItems: 'flex-end' },
  slot: { width: ITEM, alignItems: 'center', justifyContent: 'flex-end' },
  bar: { transformOrigin: 'bottom' },
  ticks: { height: 20, marginTop: 6 },
  tick: { position: 'absolute', width: 40, textAlign: 'center', fontFamily: F.mono, fontSize: 10, color: D.ink40 },
});
