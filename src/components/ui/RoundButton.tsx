import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { D, lightShadow } from '@/lib/design';
import { Icon, type IconName } from '../Icon';

type Props = {
  icon: IconName;
  onPress?: () => void;
  size?: number;
  tone?: 'light' | 'dark' | 'glass' | 'sun';
  label: string; // для VoiceOver
  style?: ViewStyle;
};

const TONES = {
  light: { bg: D.white, fg: D.ink },
  dark: { bg: D.ink, fg: D.paper },
  glass: { bg: 'rgba(15,14,12,0.45)', fg: D.paper },
  sun: { bg: D.sun, fg: D.white },
};

// Круглая кнопка: при нажатии чуть сжимается на пружине
export function RoundButton({ icon, onPress, size = 44, tone = 'light', label, style }: Props) {
  const s = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  const t = TONES[tone];
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => (s.value = withSpring(0.92, { damping: 18, stiffness: 400 }))}
      onPressOut={() => (s.value = withSpring(1, { damping: 14, stiffness: 300 }))}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={style}
    >
      <Animated.View style={anim}>
        <View style={[styles.base, tone === 'light' && lightShadow, { width: size, height: size, borderRadius: size / 2, backgroundColor: t.bg }]}>
          <Icon name={icon} size={size * 0.42} color={t.fg} />
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({ base: { alignItems: 'center', justifyContent: 'center' } });
