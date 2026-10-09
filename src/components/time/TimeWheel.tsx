// Колесо времени: три строки, выбранная — посередине на светлой плашке (B3, C5)
import * as Haptics from 'expo-haptics';
import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
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
  const onScroll = useAnimatedScrollHandler((e) => {
    y.value = e.contentOffset.y;
  });
  const settle = (off: number) => {
    const i = Math.max(0, Math.min(count - 1, Math.round(off / item)));
    if (i !== last.current) {
      last.current = i;
      onChange(i);
      Haptics.selectionAsync().catch(() => {});
    }
  };
  return (
    <View style={{ height: item * 3 }}>
      <View style={[styles.band, { top: item * 1.5 - band / 2, height: band }]} />
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        snapToInterval={item}
        decelerationRate="fast"
        contentOffset={{ x: 0, y: initial * item }}
        contentContainerStyle={{ paddingVertical: item }}
        onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.y)}
        onScrollEndDrag={(e) => {
          if (!e.nativeEvent.velocity || Math.abs(e.nativeEvent.velocity.y) < 0.05) settle(e.nativeEvent.contentOffset.y);
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
      <Animated.Text style={[{ fontFamily: F.mono, fontSize: size, color: D.ink }, style]}>{label}</Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  band: { position: 'absolute', left: 0, right: 0, borderRadius: 14, backgroundColor: D.paper },
});
