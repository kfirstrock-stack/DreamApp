// B3 · «Когда?» — выбор даты и времени (макет B3 + утверждённые B3·час / день / неделя, 09.10)
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Icon } from '@/components/Icon';
import { D, F, SHEET_SPRING } from '@/lib/design';
import { fetchTimeBuckets } from '@/lib/photos';
import type { Step } from '@/lib/timeSteps';
import type { Bounds } from '@/lib/types';

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const WEEK = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];
const ROW = 40; // шаг строк календаря
const ITEM = 37; // шаг колеса времени
const pad = (n: number) => String(n).padStart(2, '0');
const dayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const mondayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));

type Props = {
  step: Step;
  moment: Date; // выбранный сейчас момент на карте
  bounds: Bounds; // область карты — точки и счётчик только «здесь»
  onClose: () => void;
  onPick: (at: Date) => void;
};

export function DateSheet({ step, moment, bounds, onClose, onPick }: Props) {
  const insets = useSafeAreaInsets();
  const clockStep = step === '15m' || step === 'hour';
  const slotMin = step === 'hour' ? 60 : 15;
  const slots = (24 * 60) / slotMin;

  const [day, setDay] = useState(() => dayOf(moment));
  const [month, setMonth] = useState(() => new Date(moment.getFullYear(), moment.getMonth(), 1));
  const [slot, setSlot] = useState(() => Math.floor((moment.getHours() * 60 + moment.getMinutes()) / slotMin));
  const [wheelKey, setWheelKey] = useState(0); // быстрые варианты переставляют колесо

  // Сетка месяца: полные недели с понедельника
  const grid = useMemo(() => {
    const first = mondayOf(month);
    const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const rows = Math.ceil((((month.getDay() + 6) % 7) + last.getDate()) / 7);
    return { first, rows, end: new Date(first.getFullYear(), first.getMonth(), first.getDate() + rows * 7) };
  }, [month]);

  // Точки — дни, когда здесь есть фото; счётчик выбранного интервала
  const [dayCounts, setDayCounts] = useState<Map<number, number>>(new Map());
  const [slotCounts, setSlotCounts] = useState<Map<number, number>>(new Map());
  const b = `${bounds.minLat},${bounds.minLng},${bounds.maxLat},${bounds.maxLng}`;
  useEffect(() => {
    let off = false;
    fetchTimeBuckets(bounds, 'day', grid.first, grid.end, grid.first)
      .then((m) => !off && setDayCounts(m))
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [grid.first.getTime(), b]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!clockStep) return;
    let off = false;
    const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
    fetchTimeBuckets(bounds, step === 'hour' ? 'hour' : '15min', day, next, day)
      .then((m) => !off && setSlotCounts(m))
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [day.getTime(), step, b]); // eslint-disable-line react-hooks/exhaustive-deps

  const weekStart = mondayOf(day);
  const count = (() => {
    if (clockStep) return slotCounts.get(new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, slot * slotMin).getTime()) ?? 0;
    if (step === 'day') return dayCounts.get(day.getTime()) ?? 0;
    let n = 0;
    for (let k = 0; k < 7; k++) n += dayCounts.get(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + k).getTime()) ?? 0;
    return n;
  })();

  const today = dayOf(new Date());
  const lastMonth = month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth();
  const tick = () => Haptics.selectionAsync().catch(() => {});

  const quick = (back: { d?: number; y?: number }) => {
    const n = new Date();
    const at = new Date(n.getFullYear() - (back.y ?? 0), n.getMonth(), n.getDate() - (back.d ?? 0), n.getHours(), n.getMinutes());
    setDay(dayOf(at));
    setMonth(new Date(at.getFullYear(), at.getMonth(), 1));
    setSlot(Math.floor((at.getHours() * 60 + at.getMinutes()) / slotMin));
    setWheelKey((k) => k + 1);
    tick();
  };

  const show = () => {
    let at: Date;
    if (clockStep) at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, slot * slotMin + 1);
    else if (step === 'day') at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12);
    else at = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate(), 12);
    const now = new Date();
    onPick(at > now ? now : at);
  };

  const cell = (useWindowDimensions().width - 48) / 7;

  return (
    <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(180)} style={styles.dim}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Закрыть" />
      <Animated.View
        entering={SlideInDown.springify().damping(SHEET_SPRING.damping).stiffness(SHEET_SPRING.stiffness).mass(SHEET_SPRING.mass)}
        exiting={SlideOutDown.duration(200)}
        style={[styles.sheet, { paddingBottom: Math.max(insets.bottom + 3, 24) }]}
      >
        {/* ручка — та же дуга, что у шкалы; тап закрывает */}
        <Pressable onPress={onClose} style={styles.grip} hitSlop={{ top: 10, bottom: 6, left: 30, right: 30 }} accessibilityLabel="Закрыть">
          <Svg width={25} height={8}>
            <Path d="M 1.5 1.5 C 8.5 5 16.5 5 23.5 1.5" stroke="rgba(22,19,15,0.28)" strokeWidth={2} strokeLinecap="round" fill="none" />
          </Svg>
        </Pressable>
        <Text style={styles.title}>Когда?</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsWrap} contentContainerStyle={styles.chips}>
          {[
            { t: 'Сейчас', b: {} },
            { t: 'Вчера', b: { d: 1 } },
            { t: 'Неделю назад', b: { d: 7 } },
            { t: 'Год назад', b: { y: 1 } },
          ].map((c) => (
            <Pressable key={c.t} onPress={() => quick(c.b)} style={({ pressed }) => [styles.chip, pressed && { backgroundColor: D.paper }]}>
              <Text style={styles.chipText}>{c.t}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.monthRow}>
          <Pressable hitSlop={12} onPress={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))} accessibilityLabel="Предыдущий месяц">
            <Icon name="chevL" size={20} color={D.ink} />
          </Pressable>
          <Text style={styles.monthText}>
            {MONTHS[month.getMonth()]} {month.getFullYear()}
          </Text>
          <Pressable hitSlop={12} disabled={lastMonth} onPress={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))} accessibilityLabel="Следующий месяц">
            <Icon name="chevR" size={20} color={lastMonth ? D.line : D.ink} />
          </Pressable>
        </View>

        <View style={styles.weekRow}>
          {WEEK.map((w) => (
            <Text key={w} style={[styles.weekText, { width: cell }]}>
              {w}
            </Text>
          ))}
        </View>

        {Array.from({ length: grid.rows }, (_, r) => {
          const rowStart = new Date(grid.first.getFullYear(), grid.first.getMonth(), grid.first.getDate() + r * 7);
          const weekOn = step === 'week' && sameDay(rowStart, weekStart);
          return (
            <View key={r} style={styles.row}>
              {weekOn && <View style={styles.weekBand} />}
              {Array.from({ length: 7 }, (_, c) => {
                const d = new Date(rowStart.getFullYear(), rowStart.getMonth(), rowStart.getDate() + c);
                if (d.getMonth() !== month.getMonth()) return <View key={c} style={{ width: cell }} />;
                const future = d > today;
                const on = (step === 'day' || clockStep) && sameDay(d, day);
                const has = (dayCounts.get(d.getTime()) ?? 0) > 0;
                return (
                  <Pressable
                    key={c}
                    disabled={future}
                    onPress={() => {
                      setDay(d);
                      tick();
                    }}
                    style={[styles.cell, { width: cell }]}
                    accessibilityLabel={`${d.getDate()} ${MONTHS[d.getMonth()]}`}
                  >
                    {on && <View style={styles.dayOn} />}
                    <Text style={[styles.dayText, (on || weekOn) && styles.dayTextBold, on && { color: D.white }, future && { color: D.ink40 }]}>{d.getDate()}</Text>
                    {has && !on && <View style={styles.dot} />}
                  </Pressable>
                );
              })}
            </View>
          );
        })}

        {clockStep && (
          <>
            <Text style={styles.timeLabel}>ВРЕМЯ</Text>
            <Wheel key={`${step}:${wheelKey}`} count={slots} initial={slot} slotMin={slotMin} onChange={setSlot} />
          </>
        )}

        <Pressable onPress={show} style={({ pressed }) => [styles.button, !clockStep && { marginTop: 17.5 }, pressed && { opacity: 0.88 }]}>
          <Text style={styles.buttonText}>Показать {count} фото</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

/** Колесо времени: 3 строки, выбранная — посередине на светлой плашке */
function Wheel({ count, initial, slotMin, onChange }: { count: number; initial: number; slotMin: number; onChange: (i: number) => void }) {
  const y = useSharedValue(initial * ITEM);
  const last = useRef(initial);
  const onScroll = useAnimatedScrollHandler((e) => {
    y.value = e.contentOffset.y;
  });
  const settle = (off: number) => {
    const i = Math.max(0, Math.min(count - 1, Math.round(off / ITEM)));
    if (i !== last.current) {
      last.current = i;
      onChange(i);
      Haptics.selectionAsync().catch(() => {});
    }
  };
  return (
    <View style={styles.wheel}>
      <View style={styles.band} />
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM}
        decelerationRate="fast"
        contentOffset={{ x: 0, y: initial * ITEM }}
        contentContainerStyle={{ paddingVertical: ITEM }}
        onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.y)}
        onScrollEndDrag={(e) => {
          if (!e.nativeEvent.velocity || Math.abs(e.nativeEvent.velocity.y) < 0.05) settle(e.nativeEvent.contentOffset.y);
        }}
      >
        {Array.from({ length: count }, (_, i) => (
          <WheelItem key={i} i={i} y={y} label={`${pad(Math.floor((i * slotMin) / 60))} : ${pad((i * slotMin) % 60)}`} />
        ))}
      </Animated.ScrollView>
    </View>
  );
}

function WheelItem({ i, y, label }: { i: number; y: SharedValue<number>; label: string }) {
  const style = useAnimatedStyle(() => {
    const k = Math.min(1, Math.abs(y.value / ITEM - i)); // 0 — в центре, 1 — соседняя строка
    return { opacity: 1 - 0.7 * k, transform: [{ scale: 1 - (8 / 28) * k }] };
  });
  return (
    <View style={styles.item}>
      <Animated.Text style={[styles.itemText, style]}>{label}</Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,14,12,0.45)', justifyContent: 'flex-end', zIndex: 3000, elevation: 50 },
  sheet: {
    backgroundColor: D.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: '#17120D',
    shadowOpacity: 0.14,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: -6 },
  },
  grip: { alignSelf: 'center', height: 26, paddingTop: 9 },
  title: { marginLeft: 24, fontFamily: F.serif, fontSize: 30, lineHeight: 40, color: D.ink },
  chipsWrap: { marginTop: 12, flexGrow: 0 },
  chips: { paddingHorizontal: 24, gap: 8 },
  chip: { borderWidth: 1, borderColor: D.line, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: D.white },
  chipText: { fontFamily: F.sansMedium, fontSize: 13, lineHeight: 17, color: D.ink },
  monthRow: { marginTop: 17, marginHorizontal: 24, height: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthText: { fontFamily: F.sansSemi, fontSize: 17, color: D.ink },
  weekRow: { marginTop: 14, marginHorizontal: 24, flexDirection: 'row', height: 16.5 },
  weekText: { textAlign: 'center', fontFamily: F.monoRegular, fontSize: 10, color: D.ink40 },
  row: { marginHorizontal: 24, height: ROW, flexDirection: 'row' },
  weekBand: { position: 'absolute', left: 0, right: 0, top: 3, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,90,54,0.12)' },
  cell: { height: ROW, alignItems: 'center' },
  dayOn: { position: 'absolute', top: 3, width: 34, height: 34, borderRadius: 17, backgroundColor: D.sun },
  dayText: { marginTop: 10.5, fontFamily: F.sans, fontSize: 15, lineHeight: 19, color: D.ink },
  dayTextBold: { fontFamily: F.sansSemi },
  dot: { position: 'absolute', top: 33.5, width: 4, height: 4, borderRadius: 2, backgroundColor: D.sun },
  timeLabel: { marginTop: 17.5, marginLeft: 24, fontFamily: F.mono, fontSize: 11, lineHeight: 15, letterSpacing: 0.88, color: D.ink60 },
  wheel: { marginTop: -1, marginHorizontal: 24, height: ITEM * 3 },
  band: { position: 'absolute', left: 0, right: 0, top: ITEM * 1.5 - 25, height: 50, borderRadius: 14, backgroundColor: D.paper },
  item: { height: ITEM, alignItems: 'center', justifyContent: 'center' },
  itemText: { fontFamily: F.mono, fontSize: 28, color: D.ink },
  button: { marginTop: 18.5, marginHorizontal: 24, backgroundColor: D.sun, borderRadius: 999, paddingVertical: 17, alignItems: 'center' },
  buttonText: { fontFamily: F.sansSemi, fontSize: 16, lineHeight: 20, color: D.white },
});
