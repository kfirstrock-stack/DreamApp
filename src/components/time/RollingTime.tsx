import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { D, F } from '@/lib/design';

// Барабан из трёх кругов 0–9: после 9 сразу идёт 0, без отката через всю колонку
const CYCLES = 3;
const CELLS = Array.from({ length: 10 * CYCLES }, (_, j) => j);
const ROLL = { duration: 320, easing: Easing.out(Easing.cubic) };

function digitAt(i: number, step: number, place: number) {
  'worklet';
  const m = i * step;
  const hh = Math.floor(m / 60) % 24;
  const mm = m % 60;
  if (place === 0) return Math.floor(hh / 10);
  if (place === 1) return hh % 10;
  if (place === 2) return Math.floor(mm / 10);
  return mm % 10;
}

const wrap10 = (v: number) => {
  'worklet';
  return ((v % 10) + 10) % 10;
};

// Одна ячейка барабана: растворяется по мере ухода от центра окошка
function Cell({ j, pos, h, size, color }: { j: number; pos: SharedValue<number>; h: number; size: number; color: string }) {
  const style = useAnimatedStyle(() => {
    const centre = wrap10(pos.value) + 10; // текущая цифра — в среднем круге
    const d = Math.abs(j - centre);
    return { opacity: d >= 1 ? 0 : 1 - d * 0.9 };
  });
  return (
    <Animated.Text style={[styles.digit, { fontSize: size, lineHeight: h, height: h, color }, style]}>{j % 10}</Animated.Text>
  );
}

function RollingDigit({ index, step, place, size, color }: { index: SharedValue<number>; step: number; place: number; size: number; color: string }) {
  const h = Math.round(size * 1.18);
  const reduce = useReducedMotion();
  const start = digitAt(index.value, step, place);
  const target = useSharedValue(start); // накапливаемая позиция барабана (без обрезки до 0–9)
  const pos = useSharedValue(start);

  useAnimatedReaction(
    () => index.value,
    (i, prev) => {
      if (prev === null || i === prev) return;
      const from = digitAt(prev, step, place);
      const to = digitAt(i, step, place);
      if (from === to) return;
      // Вперёд по времени — барабан крутится вверх, назад — вниз; всегда коротким путём по кругу
      const steps = i > prev ? (to - from + 10) % 10 : -((from - to + 10) % 10);
      target.value += steps;
      pos.value = reduce ? target.value : withTiming(target.value, ROLL);
    },
  );

  const column = useAnimatedStyle(() => ({ transform: [{ translateY: -(wrap10(pos.value) + 10) * h }] }));

  return (
    <View style={{ height: h, width: size * 0.6, overflow: 'hidden' }}>
      <Animated.View style={column}>
        {CELLS.map((j) => (
          <Cell key={j} j={j} pos={pos} h={h} size={size} color={color} />
        ))}
      </Animated.View>
    </View>
  );
}

/** «14:05» для текущего интервала; каждая цифра — отдельный барабан */
export function RollingTime({ index, step = 15, size = 56, color = D.ink }: { index: SharedValue<number>; step?: number; size?: number; color?: string }) {
  return (
    <View style={styles.row}>
      <RollingDigit index={index} step={step} place={0} size={size} color={color} />
      <RollingDigit index={index} step={step} place={1} size={size} color={color} />
      <Text style={[styles.colon, { fontSize: size, lineHeight: Math.round(size * 1.18), color }]}>:</Text>
      <RollingDigit index={index} step={step} place={2} size={size} color={color} />
      <RollingDigit index={index} step={step} place={3} size={size} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  digit: { fontFamily: F.serif, textAlign: 'center', fontVariant: ['lining-nums', 'tabular-nums'] },
  colon: { fontFamily: F.serif, marginHorizontal: 1, marginTop: -4 },
});
