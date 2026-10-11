// Обычные экраны «вперёд/назад» — на JS-стеке, чтобы переходы были в стиле DreamApp (утверждено 12.10):
// новый экран въезжает по нашей кривой (медленный старт — мягкая посадка), предыдущий отстаёт с параллаксом
// и чуть темнеет, а содержимое нового экрана доезжает лесенкой (см. components/ui/Stagger). Свайп назад от края — как в iOS.
// Шторки, фото и онбординг остаются в корневом (нативном) стеке со своими анимациями.
import { Animated, Easing } from 'react-native';
import { Stack, type StackCardInterpolationProps } from 'expo-router/js-stack';
import { D } from '@/lib/design';

const EASE = Easing.bezier(0.76, 0, 0.24, 1);
const OPEN = { animation: 'timing', config: { duration: 560, easing: EASE } } as const;
const CLOSE = { animation: 'timing', config: { duration: 460, easing: EASE } } as const;

function slideParallax({ current, next, layouts, inverted }: StackCardInterpolationProps) {
  const W = layouts.screen.width;
  const enter = Animated.multiply(current.progress.interpolate({ inputRange: [0, 1], outputRange: [W, 0], extrapolate: 'clamp' }), inverted);
  const leave = next
    ? Animated.multiply(next.progress.interpolate({ inputRange: [0, 1], outputRange: [0, -W * 0.3], extrapolate: 'clamp' }), inverted)
    : 0;
  return {
    cardStyle: { transform: [{ translateX: enter }, { translateX: leave }] },
    // тень от нового экрана на предыдущем
    overlayStyle: { opacity: current.progress.interpolate({ inputRange: [0, 1], outputRange: [0, 0.14], extrapolate: 'clamp' }) },
  };
}

function fade({ current }: StackCardInterpolationProps) {
  return { cardStyle: { opacity: current.progress } };
}

export default function MainLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: D.paper },
        cardOverlayEnabled: true,
        cardShadowEnabled: true,
        gestureEnabled: true,
        gestureDirection: 'horizontal',
        transitionSpec: { open: OPEN, close: CLOSE },
        cardStyleInterpolator: slideParallax,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen
        name="search"
        options={{
          cardStyleInterpolator: fade,
          transitionSpec: { open: { animation: 'timing', config: { duration: 200 } } as const, close: { animation: 'timing', config: { duration: 200 } } as const },
          gestureEnabled: false,
        }}
      />
    </Stack>
  );
}
