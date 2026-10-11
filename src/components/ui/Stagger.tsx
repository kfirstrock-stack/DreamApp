// «Лесенка» при переходе (утверждено 12.10): блоки нового экрана доезжают с отставанием — чем ниже i, тем раньше.
// Работает внутри JS-стека (app/(main)); вне его просто показывает содержимое.
import { useContext, type ReactNode } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { CardAnimationContext } from 'expo-router/js-stack';

export function Stagger({ i = 0, children, style }: { i?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const anim = useContext(CardAnimationContext);
  if (!anim) return <Animated.View style={style}>{children}</Animated.View>;
  const W = anim.layouts.screen.width;
  const k = 0.1 + i * 0.09; // доля ширины экрана, на которую блок отстаёт от карточки
  const p = anim.current.progress;
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: p.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 0.4, 1], extrapolate: 'clamp' }),
          transform: [{ translateX: p.interpolate({ inputRange: [0, 1], outputRange: [W * k, 0], extrapolate: 'clamp' }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
