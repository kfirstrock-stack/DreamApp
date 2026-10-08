import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { colors, shadow } from '@/lib/theme';
import { Icon, type IconName } from './Icon';

type Props = {
  icon: IconName;
  onPress?: () => void;
  size?: number;
  active?: boolean;
  variant?: 'white' | 'teal' | 'camera' | 'ghost';
  style?: ViewStyle;
  accessibilityLabel?: string;
};

// Круглая кнопка из макета: белая с тенью, бирюзовая (активная) или красная кнопка камеры с оранжевым кольцом
export function CircleButton({ icon, onPress, size = 48, active, variant = 'white', style, accessibilityLabel }: Props) {
  const isCamera = variant === 'camera';
  const bg =
    variant === 'teal' || active ? colors.teal : isCamera ? colors.red : variant === 'ghost' ? 'rgba(0,0,0,0.35)' : colors.white;
  const fg = variant === 'white' && !active ? colors.text : colors.white;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
      style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] }, style]}
    >
      <View
        style={[
          styles.base,
          variant !== 'ghost' && shadow,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
          isCamera && { borderWidth: 4, borderColor: colors.orange },
          active && variant === 'white' && { borderWidth: 3, borderColor: colors.white },
        ]}
      >
        <Icon name={icon} size={size * 0.44} color={fg} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
});
