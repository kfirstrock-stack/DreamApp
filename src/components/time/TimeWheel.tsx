// Колесо времени: три строки, выбранная — посередине на светлой плашке (B3, C5)
import * as Haptics from 'expo-haptics';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { runOnJS, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { D, F } from '@/lib/design';

const pad = (n: number) => String(n).padStart(2, '0');

type Props = {
  count: number;
  initial: number;
  slotMin: number;
  onChange: (i: number) => void;
  item?: number; // шаг строк
  size?: number; // кегль выбранной строки
  band?: number; // высота плашки
};

export function TimeWheel({ count, initial, slotMin, onChange, item = 37, size = 28, band = 50 }: Props) {
  const y = useSharedValue(initial * item);
  const last = useRef(initial);
  const list = useRef<Animated.ScrollView>(null);
  const placed = useRef(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
  }, []);

  const indexOf = (off: number) => Math.max(0, Math.min(count - 1, Math.round(off / item)));

  const settle = (off: number, haptic: boolean) => {
    const i = indexOf(off);
    if (i === last.current) return;
    last.current = i;
    onChange(i);
    if (haptic) Haptics.selectionAsync().catch(() => {});
  };

  // На вебе contentOffset и onMomentumScrollEnd часто не срабатывают
  // (колесо мыши, отсутствие инерции) — слот обновляем с каждого onScroll.
  const report = (off: number) => {
    settle(off, false);
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => settle(off, true), 80);
  };

  const onScroll = useAnimatedScrollHandler((e) => {
    y.value = e.contentOffset.y;
    runOnJS(report)(e.contentOffset.y);
  });

  const snapTo = (i: number) => {
    const next = Math.max(0, Math.min(count - 1, i));
    last.current = next;
    onChange(next);
    list.current?.scrollTo({ y: next * item, animated: true });
  };

  const cur = `${pad(Math.floor((last.current * slotMin) / 60))}:${pad((last.current * slotMin) % 60)}`;
  return (
    <View
      style={{ height: item * 3 }}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Время"
      accessibilityValue={{ text: cur }}
      accessibilityActions={[{ name: 'increment', label: 'Позже' }, { name: 'decrement', label: 'Раньше' }]}
      onAccessibilityAction={(e) => {
        const name = e.nativeEvent.actionName;
        if (name !== 'increment' && name !== 'decrement') return;
        snapTo(last.current + (name === 'increment' ? 1 : -1));
      }}
    >
      <View pointerEvents="none" style={[styles.band, { top: item * 1.5 - band / 2, height: band }]} />
      <Animated.ScrollView
        ref={list}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        snapToInterval={item}
        disableIntervalMomentum
        decelerationRate="fast"
        contentOffset={{ x: 0, y: initial * item }}
        contentContainerStyle={{ paddingVertical: item }}
        onLayout={() => {
          // web часто игнорирует contentOffset — выставляем старт после вёрстки
          if (placed.current) return;
          placed.current = true;
          list.current?.scrollTo({ y: initial * item, animated: false });
        }}
        onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.y, true)}
        onScrollEndDrag={(e) => {
          if (!e.nativeEvent.velocity || Math.abs(e.nativeEvent.velocity.y) < 0.05) settle(e.nativeEvent.contentOffset.y, true);
        }}
      >
        {Array.from({ length: count }, (_, i) => (
          <Row key={i} i={i} y={y} item={item} size={size} label={`${pad(Math.floor((i * slotMin) / 60))} : ${pad((i * slotMin) % 60)}`} />
        ))}
      </Animated.ScrollView>
    </View>
  );
}

function Row({ i, y, item, size, label }: { i: number; y: SharedValue<number>; item: number; size: number; label: string }) {
  const style = useAnimatedStyle(() => {
    const k = Math.min(1, Math.abs(y.value / item - i)); // 0 — в центре, 1 — соседняя строка
    return { opacity: 1 - 0.7 * k, transform: [{ scale: 1 - ((size - 20) / size) * k }] };
  });
  return (
    <View style={{ height: item, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.Text maxFontSizeMultiplier={1.3} style={[{ fontFamily: F.mono, fontSize: size, color: D.ink }, style]}>{label}</Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  band: { position: 'absolute', left: 0, right: 0, borderRadius: 14, backgroundColor: D.paper },
});
