import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { D, F } from '@/lib/design';

type Props = { uri: string; minutes: number; x: number; y: number; now: SharedValue<number>; windowMin?: number };
const SIZE = 54;

// Фото «проявляется», когда шкала подходит к моменту съёмки, и гаснет, когда уходит дальше.
// Всё считается в анимационном потоке — React этот компонент не перерисовывает.
export const DevelopingPhoto = memo(function DevelopingPhoto({ uri, minutes, x, y, now, windowMin = 15 }: Props) {
  const v = useDerivedValue(() => Math.exp(-Math.pow((minutes - now.value) / 24, 2)));
  const inside = useDerivedValue(() => (Math.abs(minutes - now.value) <= windowMin / 2 ? 1 : 0));
  const wrap = useAnimatedStyle(() => ({
    opacity: v.value < 0.03 ? 0 : v.value,
    transform: [{ scale: 0.78 + 0.22 * v.value }, { translateY: (1 - v.value) * 10 }],
    zIndex: Math.round(v.value * 100),
  }));
  const veil = useAnimatedStyle(() => ({ opacity: (1 - v.value) * 0.85 }));
  const ring = useAnimatedStyle(() => ({ borderColor: inside.value ? D.sun : D.white }));
  const chip = useAnimatedStyle(() => ({ backgroundColor: inside.value ? D.sun : D.ink }));
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(Math.round(minutes % 60)).padStart(2, '0');
  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, { left: x - SIZE / 2, top: y - SIZE / 2 }, wrap]}>
      <Animated.View style={[styles.frame, ring]}>
        <Image source={{ uri }} style={styles.img} contentFit="cover" cachePolicy="memory-disk" />
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: D.paper }, veil]} />
      </Animated.View>
      <Animated.View style={[styles.chip, chip]}>
        <Text style={styles.chipText}>
          {hh}:{mm}
        </Text>
      </Animated.View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrap: { position: 'absolute', alignItems: 'center' },
  frame: {
    width: SIZE, height: SIZE, borderRadius: 15, borderWidth: 3, overflow: 'hidden', backgroundColor: D.paper2,
    shadowColor: '#17120D', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  img: { width: '100%', height: '100%' },
  chip: { marginTop: 4, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999 },
  chipText: { fontFamily: F.mono, fontSize: 10, color: D.white },
});
