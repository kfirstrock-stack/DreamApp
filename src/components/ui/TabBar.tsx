import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { D, F, softShadow } from '@/lib/design';
import { Icon, type IconName } from '../Icon';

export type Tab = 'map' | 'moments' | 'profile';

type Props = {
  active: Tab | null;
  onMap: () => void;
  onMoments: () => void;
  onAdd: () => void;
  onProfile: () => void;
};

const LAYOUT = LinearTransition.springify().damping(20).stiffness(220);

// Тёмная панель: Карта · Моменты · + · Профиль. Активная вкладка — светлая «пилюля» с подписью,
// которая плавно перетекает между пунктами.
export function TabBar({ active, onMap, onMoments, onAdd, onProfile }: Props) {
  const insets = useSafeAreaInsets();
  const item = (key: Tab, icon: IconName, label: string, onPress: () => void) => {
    const on = active === key;
    return (
      <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={label} hitSlop={4}>
        <Animated.View layout={LAYOUT} style={[styles.item, on && styles.itemOn]}>
          <Icon name={icon} size={21} color={on ? D.ink : D.paper} />
          {on && (
            <Animated.Text entering={FadeIn.duration(180)} exiting={FadeOut.duration(80)} style={styles.label}>
              {label}
            </Animated.Text>
          )}
        </Animated.View>
      </Pressable>
    );
  };
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) + 4 }]}>
      <Animated.View layout={LAYOUT} style={styles.bar}>
        {item('map', 'map', 'Карта', onMap)}
        {item('moments', 'grid', 'Моменты', onMoments)}
        <Pressable onPress={onAdd} accessibilityRole="button" accessibilityLabel="Новый момент" hitSlop={4}>
          <View style={styles.add}>
            <Icon name="plus" size={22} color={D.white} />
          </View>
        </Pressable>
        {item('profile', 'person', 'Профиль', onProfile)}
      </Animated.View>
    </View>
  );
}

export const TAB_BAR_SPACE = 64 + 16;

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 1000, elevation: 40 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: D.ink, borderRadius: 999, padding: 8, ...softShadow },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, paddingHorizontal: 14, borderRadius: 23 },
  itemOn: { backgroundColor: D.paper, paddingLeft: 16, paddingRight: 18 },
  label: { fontFamily: F.sansSemi, fontSize: 14, color: D.ink },
  add: { width: 48, height: 48, borderRadius: 24, backgroundColor: D.sun, alignItems: 'center', justifyContent: 'center', marginHorizontal: 4 },
});
