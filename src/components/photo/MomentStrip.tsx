import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { D, F } from '@/lib/design';

const BARS = 48;
const SPAN_MIN = 30;
const MAX_H = 24;
const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Окно гистограммы: 30 минут, начало — за ~15 минут до снимка, округлено до 10 минут */
export function stripRange(taken: Date) {
  const from = new Date(taken.getTime() - 15 * 60000);
  from.setMinutes(Math.floor(from.getMinutes() / 10) * 10, 0, 0);
  return { from, to: new Date(from.getTime() + SPAN_MIN * 60000) };
}

// Мини-шкала «сколько снимали здесь вокруг этого момента», как на карте, только для одной точки
export function MomentStrip({ taken, times, onPress }: { taken: Date; times: number[]; onPress?: () => void }) {
  const { from, to } = stripRange(taken);
  const step = (to.getTime() - from.getTime()) / BARS;
  const at = (taken.getTime() - from.getTime()) / (to.getTime() - from.getTime());

  const heights = useMemo(() => {
    // F5: рядом никого (в окне только сам снимок) — серые на нуле, отметка момента во всю высоту
    const own = times.indexOf(taken.getTime());
    const others = own >= 0 ? times.filter((_, i) => i !== own) : times;
    const inRange = others.filter((t) => t >= from.getTime() && t < from.getTime() + step * BARS);
    if (inRange.length === 0) return new Array(BARS).fill(3).map((h, i) => (Math.abs(i - Math.floor(at * BARS)) <= 1 ? MAX_H : h));
    const raw = new Array(BARS).fill(0);
    for (const t of times) {
      const i = Math.floor((t - from.getTime()) / step);
      if (i >= 0 && i < BARS) raw[i]++;
    }
    // мягкое сглаживание, чтобы получился «холм», а не одиночные пики
    const k = [0.25, 0.5, 1, 0.5, 0.25];
    const smooth = raw.map((_, i) => k.reduce((s, w, j) => s + w * (raw[i + j - 2] ?? 0), 0));
    const max = Math.max(1, ...smooth);
    return smooth.map((v) => Math.round(3 + (v / max) * (MAX_H - 3)));
  }, [times, from.getTime(), step, taken.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps

  const me = Math.floor(at * BARS);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Все снимки этого места вокруг момента">
      <View style={styles.bars}>
        {heights.map((h, i) => (
          <View key={i} style={[styles.bar, { height: h, backgroundColor: Math.abs(i - me) <= 1 ? D.sun : 'rgba(244,239,230,0.22)' }]} />
        ))}
      </View>
      <View style={styles.labels}>
        <Text style={styles.label}>{hhmm(from)}</Text>
        <Text style={[styles.label, styles.now, { left: `${at * 100}%` }]}>{hhmm(taken)}</Text>
        <Text style={styles.label}>{hhmm(to)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bars: { height: MAX_H, flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  bar: { flex: 1, borderRadius: 1.5 },
  labels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, height: 14 },
  label: { fontFamily: F.mono, fontSize: 10, color: 'rgba(244,239,230,0.4)' },
  now: { position: 'absolute', width: 40, marginLeft: -20, textAlign: 'center', color: D.sun },
});
