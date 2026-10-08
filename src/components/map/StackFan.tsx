import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Icon } from '@/components/Icon';
import { D, F, softShadow } from '@/lib/design';
import { photoSource } from '@/lib/photos';
import type { Photo } from '@/lib/types';
import { PIN } from './MomentLayer';

const C = 84; // размер карточки в веере
const MAX_CARDS = 5;

type Props = {
  photos: Photo[]; // первая — верхняя в стопке
  origin: { x: number; y: number }; // центр стопки на экране
  width: number;
  top: number; // верх свободной зоны (под поиском)
  bottom: number; // низ свободной зоны (над шкалой)
  closing: boolean;
  onPick: (p: Photo) => void;
  onAll: () => void;
  onClose: () => void; // попросить закрыть
  onClosed: () => void; // анимация закрытия закончилась
};

type Slot = { photo: Photo; x0: number; y0: number; r0: number; x1: number; y1: number; r1: number; z: number };

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// Стопка раскрывается веером: карточки вылетают из-под верхней и ложатся дугой, как карты в руке
export function StackFan({ photos, origin, width, top, bottom, closing, onPick, onAll, onClose, onClosed }: Props) {
  const slots = useMemo<Slot[]>(() => {
    const list = photos.slice(0, MAX_CARDS);
    const leader = list[0]?.id;
    const ordered = [...list].sort((a, b) => +new Date(a.taken_at) - +new Date(b.taken_at)); // слева направо — по времени
    const n = ordered.length;
    const step = n > 1 ? Math.min(C + 14, (width - 32 - C) / (n - 1)) : 0;
    const span = step * (n - 1) + C;
    const cx = Math.min(width - 16 - span / 2, Math.max(16 + span / 2, origin.x));
    // ряд над стопкой; если не влезает под поиском — под ней
    let cy = origin.y - 130;
    if (cy - C / 2 - 12 < top) cy = origin.y + 130;
    cy = Math.min(cy, bottom - C / 2 - 70);
    // откуда вылетают: из-под верхней карточки (как в стопке на карте)
    const behind = [
      { x: -7, y: 5, r: -10 },
      { x: 7, y: -4, r: 8 },
    ];
    let b = 0;
    return ordered.map((photo, k) => {
      const rel = n > 1 ? (k / (n - 1)) * 2 - 1 : 0; // −1…1
      const isLeader = photo.id === leader;
      const from = isLeader ? { x: 0, y: 0, r: 0 } : behind[b++ % 2];
      return {
        photo,
        x0: origin.x + from.x,
        y0: origin.y + from.y,
        r0: from.r,
        x1: cx - span / 2 + C / 2 + k * step,
        y1: cy + 16 * rel * rel, // дуга: края чуть ниже
        r1: rel * 9,
        z: isLeader ? 10 : k,
      };
    });
  }, [photos, origin.x, origin.y, width, top, bottom]);

  const bg = useSharedValue(0);
  useEffect(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    bg.value = withTiming(1, { duration: 240 });
  }, [bg]);
  useEffect(() => {
    if (!closing) return;
    bg.value = withTiming(0, { duration: 260, easing: Easing.in(Easing.cubic) }, (done) => {
      if (done) scheduleOnRN(onClosed);
    });
  }, [closing, bg, onClosed]);

  const backdrop = useAnimatedStyle(() => ({ opacity: bg.value }));
  const allY = Math.max(...slots.map((s) => s.y1)) + C / 2 + 44;
  const allStyle = useAnimatedStyle(() => ({
    opacity: interpolate(bg.value, [0.5, 1], [0, 1], 'clamp'),
    transform: [{ translateY: (1 - bg.value) * 12 }],
  }));

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.backdrop, backdrop]}>
        <Pressable style={styles.fill} onPress={onClose} accessibilityLabel="Свернуть стопку" />
      </Animated.View>
      {slots.map((s, k) => (
        <FanCard key={s.photo.id} slot={s} order={k} count={slots.length} closing={closing} onPick={onPick} />
      ))}
      {photos.length > 1 && (
        <Animated.View style={[styles.allWrap, { top: allY }, allStyle]} pointerEvents={closing ? 'none' : 'box-none'}>
          <Pressable onPress={onAll} style={styles.all} hitSlop={6}>
            <Text style={styles.allText}>Все снимки момента</Text>
            <Icon name="arrow" size={14} color={D.paper} />
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}

function FanCard({ slot, order, count, closing, onPick }: { slot: Slot; order: number; count: number; closing: boolean; onPick: (p: Photo) => void }) {
  const p: SharedValue<number> = useSharedValue(0);
  useEffect(() => {
    if (closing) {
      // складываются обратно, начиная с крайних
      p.value = withDelay((count - 1 - order) * 25, withTiming(0, { duration: 220, easing: Easing.in(Easing.cubic) }));
    } else {
      // вылетают по очереди, с пружинкой
      p.value = withDelay(order * 45, withSpring(1, { damping: 13, stiffness: 170, mass: 0.8 }));
    }
  }, [closing, order, count, p]);

  const s = slot;
  const { x0, y0, r0, x1, y1, r1 } = slot; // в анимацию — только числа
  const style = useAnimatedStyle(() => {
    const t = p.value;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t - Math.sin(Math.min(1, Math.max(0, t)) * Math.PI) * 18; // лёгкий подлёт по дуге
    const scale = PIN / C + (1 - PIN / C) * t;
    return {
      transform: [{ translateX: x - C / 2 }, { translateY: y - C / 2 }, { rotate: `${r0 + (r1 - r0) * t}deg` }, { scale }],
    };
  });
  const chip = useAnimatedStyle(() => ({ opacity: interpolate(p.value, [0.6, 1], [0, 1], 'clamp') }));

  return (
    <Animated.View style={[styles.card, { zIndex: s.z }, style]}>
      <Pressable onPress={() => onPick(s.photo)} disabled={closing} accessibilityRole="button" accessibilityLabel={`Фото в ${hhmm(s.photo.taken_at)}`}>
        <View style={styles.frame}>
          <Image source={photoSource(s.photo.storage_path)} style={styles.img} contentFit="cover" cachePolicy="memory-disk" />
        </View>
        <Animated.View style={[styles.chip, chip]}>
          <Text style={styles.chipText}>{hhmm(s.photo.taken_at)}</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 3000, elevation: 40 },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(244,239,230,0.78)' },
  card: { position: 'absolute', left: 0, top: 0, width: C, alignItems: 'center' },
  frame: {
    width: C, height: C, borderRadius: 20, borderWidth: 3, borderColor: D.white, overflow: 'hidden', backgroundColor: D.paper2, ...softShadow,
  },
  img: { width: '100%', height: '100%' },
  chip: { alignSelf: 'center', marginTop: 6, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: D.ink },
  chipText: { fontFamily: F.mono, fontSize: 11, color: D.white },
  allWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  all: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: D.ink, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, ...softShadow },
  allText: { fontFamily: F.sansSemi, fontSize: 14, color: D.paper },
});
