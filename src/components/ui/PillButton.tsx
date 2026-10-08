import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { D, F } from '@/lib/design';
import { Icon, type IconName } from '../Icon';

type Props = {
  title: string;
  onPress?: () => void;
  kind?: 'primary' | 'secondary' | 'quiet' | 'dark';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  small?: boolean;
};

export function PillButton({ title, onPress, kind = 'primary', icon, loading, disabled, style, small }: Props) {
  const s = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  const bg = kind === 'primary' ? D.sun : kind === 'dark' ? D.ink : kind === 'secondary' ? 'transparent' : D.paper2;
  const fg = kind === 'primary' || kind === 'dark' ? D.white : D.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      onPressIn={() => (s.value = withSpring(0.97, { damping: 18, stiffness: 400 }))}
      onPressOut={() => (s.value = withSpring(1, { damping: 14, stiffness: 300 }))}
      accessibilityRole="button"
      style={style}
    >
      <Animated.View
        style={[
          styles.base,
          small && styles.small,
          { backgroundColor: bg, opacity: disabled ? 0.45 : 1 },
          kind === 'secondary' && { borderWidth: 1.5, borderColor: D.ink },
          anim,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={fg} />
        ) : (
          <View style={styles.row}>
            {icon && <Icon name={icon} size={small ? 15 : 18} color={fg} />}
            <Text style={[styles.text, small && { fontSize: 14 }, { color: fg }]}>{title}</Text>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { height: 54, borderRadius: 27, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center' },
  small: { height: 38, borderRadius: 19, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { fontFamily: F.sansSemi, fontSize: 16 },
});
