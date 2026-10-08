import { Image } from 'expo-image';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { D, F } from '@/lib/design';
import { project, type MapRegion } from '@/lib/geo';
import { photoSource } from '@/lib/photos';
import type { Photo } from '@/lib/types';

export type Pin = {
  photo: Photo;
  minutes: number; // минут от начала выбранного дня
  active: boolean; // снимок в текущем 15-минутном интервале — можно нажать
  suppressed: boolean; // спрятан внутри стопки
  badge: number; // сколько ещё снимков в стопке
};

type Props = {
  pins: Pin[];
  region: SharedValue<MapRegion>;
  width: number;
  height: number;
  now: SharedValue<number>;
  onPress: (photo: Photo, isStack: boolean) => void;
};

export const PIN = 56;

type PinProps = Pin & { region: SharedValue<MapRegion>; width: number; height: number; now: SharedValue<number>; onPress: (p: Photo, isStack: boolean) => void };

// Пропсы — простые значения: при шаге шкалы перерисовываются только фото, у которых что-то поменялось
const MomentPin = memo(function MomentPin({ photo, minutes, active, suppressed, badge, region, width, height, now, onPress }: PinProps) {
  const lat = photo.lat, lng = photo.lng;
  // «Проявление»: насколько момент съёмки близок к положению шкалы
  const v = useDerivedValue(() => (suppressed ? 0 : Math.exp(-Math.pow((minutes - now.value) / 24, 2))));
  const pos = useAnimatedStyle(() => {
    const p = project(lat, lng, region.value, width, height);
    const k = v.value;
    return {
      opacity: k < 0.03 ? 0 : k,
      zIndex: Math.round(k * 100) + (badge ? 200 : 0),
      transform: [{ translateX: p.x - PIN / 2 }, { translateY: p.y - PIN / 2 + (1 - k) * 10 }, { scale: 0.78 + 0.22 * k }],
    };
  });
  const veil = useAnimatedStyle(() => ({ opacity: (1 - v.value) * 0.85 }));
  const d = new Date(photo.taken_at);
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  return (
    <Animated.View style={[styles.pin, pos]} pointerEvents={active && !suppressed ? 'box-none' : 'none'}>
      <Pressable onPress={() => onPress(photo, badge > 0)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Фото в ${time}${badge ? `, ещё ${badge}` : ''}`}>
        {badge > 0 && <View style={[styles.frame, styles.under]} />}
        <View style={[styles.frame, { borderColor: active ? D.sun : D.white }]}>
          <Image source={photoSource(photo.storage_path)} style={styles.img} contentFit="cover" cachePolicy="memory-disk" recyclingKey={photo.id} />
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: D.paper }, veil]} />
        </View>
        {badge > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>+{badge}</Text>
          </View>
        )}
        <View style={[styles.chip, { backgroundColor: active ? D.sun : D.ink }]}>
          <Text style={styles.chipText}>{time}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
});

// Слой фото поверх карты: координаты пересчитываются в анимационном потоке, пока карту двигают
export function MomentLayer({ pins, region, width, height, now, onPress }: Props) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {pins.map((p) => (
        <MomentPin key={p.photo.id} {...p} region={region} width={width} height={height} now={now} onPress={onPress} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pin: { position: 'absolute', left: 0, top: 0, width: PIN, alignItems: 'center' },
  frame: {
    width: PIN, height: PIN, borderRadius: 16, borderWidth: 3, overflow: 'hidden', backgroundColor: D.paper2,
    shadowColor: '#17120D', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  under: { position: 'absolute', borderColor: D.white, transform: [{ rotate: '8deg' }, { translateX: 5 }, { translateY: -3 }], opacity: 0.9 },
  img: { width: '100%', height: '100%' },
  badge: {
    position: 'absolute', top: -7, right: -9, minWidth: 26, height: 22, paddingHorizontal: 6, borderRadius: 11,
    backgroundColor: D.sun, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: D.white,
  },
  badgeText: { fontFamily: F.mono, fontSize: 11, color: D.white },
  chip: { alignSelf: 'center', marginTop: 4, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999 },
  chipText: { fontFamily: F.mono, fontSize: 10, color: D.white },
});
