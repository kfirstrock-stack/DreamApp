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
  suppressed: boolean; // спрятан внутри стопки (или под ней)
  badge: number; // сколько ещё снимков в стопке
  under1?: string; // снимки, выглядывающие из-под верхнего
  under2?: string;
};

type Props = {
  pins: Pin[];
  region: SharedValue<MapRegion>;
  width: number;
  height: number;
  now: SharedValue<number>;
  onPress: (photo: Photo) => void;
};

export const PIN = 56;
const HALO = 150; // «зона момента» вокруг стопки

type PinProps = Pin & { region: SharedValue<MapRegion>; width: number; height: number; now: SharedValue<number>; onPress: (p: Photo) => void };

// Пропсы — простые значения: при шаге шкалы перерисовываются только фото, у которых что-то поменялось
const MomentPin = memo(function MomentPin({ photo, minutes, active, suppressed, badge, under1, under2, region, width, height, now, onPress }: PinProps) {
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
  const halo = useAnimatedStyle(() => ({ transform: [{ scale: 0.55 + 0.45 * v.value }] }));
  const d = new Date(photo.taken_at);
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const stack = badge > 0;

  return (
    <Animated.View style={[styles.pin, pos]} pointerEvents={active && !suppressed ? 'box-none' : 'none'}>
      {stack && active && <Animated.View pointerEvents="none" style={[styles.halo, halo]} />}
      <Pressable onPress={() => onPress(photo)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Фото в ${time}${stack ? `, стопка, ещё ${badge}` : ''}`}>
        {stack && (
          <>
            <View style={[styles.frame, styles.back, styles.backA]}>
              {under2 ? <Image source={photoSource(under2)} style={styles.img} contentFit="cover" cachePolicy="memory-disk" /> : null}
            </View>
            <View style={[styles.frame, styles.back, styles.backB]}>
              {under1 ? <Image source={photoSource(under1)} style={styles.img} contentFit="cover" cachePolicy="memory-disk" /> : null}
            </View>
          </>
        )}
        <View style={[styles.frame, { borderColor: active ? D.sun : D.white }]}>
          <Image source={photoSource(photo.storage_path)} style={styles.img} contentFit="cover" cachePolicy="memory-disk" recyclingKey={photo.id} />
          <Animated.View style={[styles.fill, { backgroundColor: D.paper }, veil]} />
        </View>
        {stack && (
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
    <View style={styles.layer} pointerEvents="box-none">
      {pins.map((p) => (
        <MomentPin key={p.photo.id} {...p} region={region} width={width} height={height} now={now} onPress={onPress} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  pin: { position: 'absolute', left: 0, top: 0, width: PIN, alignItems: 'center' },
  halo: {
    position: 'absolute', width: HALO, height: HALO, borderRadius: HALO / 2, left: PIN / 2 - HALO / 2, top: PIN / 2 - HALO / 2,
    backgroundColor: 'rgba(255,90,54,0.13)', borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(255,90,54,0.65)',
  },
  frame: {
    width: PIN, height: PIN, borderRadius: 16, borderWidth: 3, overflow: 'hidden', backgroundColor: D.paper2,
    shadowColor: '#17120D', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  back: { position: 'absolute', top: 0, left: 0, borderColor: D.white },
  backA: { transform: [{ translateX: -7 }, { translateY: 5 }, { rotate: '-10deg' }] },
  backB: { transform: [{ translateX: 7 }, { translateY: -4 }, { rotate: '8deg' }] },
  img: { width: '100%', height: '100%' },
  badge: {
    position: 'absolute', top: -9, right: -12, minWidth: 28, height: 24, paddingHorizontal: 7, borderRadius: 12,
    backgroundColor: D.sun, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: D.white,
  },
  badgeText: { fontFamily: F.mono, fontSize: 12, color: D.white },
  chip: { alignSelf: 'center', marginTop: 5, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  chipText: { fontFamily: F.mono, fontSize: 10, color: D.white },
});
