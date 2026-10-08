import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { scheduleOnRN } from 'react-native-worklets';
import Svg, { Path } from 'react-native-svg';
import { SHEET_SPRING } from '@/lib/design';

export type ScaleMode = 'full' | 'compact' | 'mini';
const T: Record<ScaleMode, number> = { full: 1, compact: 0, mini: -1 };
const AnimatedPath = Animated.createAnimatedComponent(Path);

type Props = {
  mode: ScaleMode;
  onTap: () => void;
  onSwipe: (dir: 'up' | 'down') => void;
  nudge?: boolean; // один раз «кивнуть» вниз — подсказка, что карточку можно тянуть
  drag: SharedValue<number>; // смещение всей карточки, пока тянем за язычок — язычок от неё не отрывается
};

// Ручка шкалы (вариант D): белый язычок над карточкой, внутри — мягкая дуга.
// Полная — дуга вниз, компактная — ровная чёрточка с точками, свёрнутая — дуга вверх.
export function ScaleGrip({ mode, onTap, onSwipe, nudge, drag: dy }: Props) {
  const t = useSharedValue(T[mode]);
  useEffect(() => {
    t.value = withSpring(T[mode], SHEET_SPRING);
  }, [mode, t]);
  useEffect(() => {
    if (!nudge) return;
    dy.value = withDelay(900, withSequence(withTiming(4, { duration: 220 }), withSpring(0, SHEET_SPRING)));
  }, [nudge, dy]);

  // дуга: края и середина двигаются навстречу — плавный перегиб
  const arcProps = useAnimatedProps(() => {
    const a = 1.75 * (1 - t.value);
    const b = 1.75 * (1 + t.value);
    return { d: `M 1.5 ${a + 1.5} C 8.5 ${b + 1.5} 16.5 ${b + 1.5} 23.5 ${a + 1.5}` };
  });
  const dots = useAnimatedStyle(() => ({ opacity: Math.max(0, 1 - Math.abs(t.value) * 1.6) }));
  const tick = () => Haptics.selectionAsync().catch(() => {});

  // тап срабатывает сразу при касании-отпускании, свайп — как только палец сдвинулся
  const gesture = Gesture.Race(
    Gesture.Pan()
      .activeOffsetY([-6, 6])
      .onUpdate((e) => {
        // карточка идёт за пальцем с сопротивлением — как резинка
        const v = e.translationY;
        dy.value = v > 0 ? Math.min(28, v * 0.35) : Math.max(-16, v * 0.25);
      })
      .onEnd((e) => {
        dy.value = withSpring(0, SHEET_SPRING);
        if (e.translationY > 14 || e.velocityY > 350) {
          scheduleOnRN(tick);
          scheduleOnRN(onSwipe, 'down');
        } else if (e.translationY < -14 || e.velocityY < -350) {
          scheduleOnRN(tick);
          scheduleOnRN(onSwipe, 'up');
        }
      }),
    Gesture.Tap()
      .maxDistance(8)
      .onEnd(() => {
        scheduleOnRN(tick);
        scheduleOnRN(onTap);
      }),
  );

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.hit} accessibilityRole="button" accessibilityLabel={mode === 'full' ? 'Свернуть шкалу' : 'Развернуть шкалу'}>
        <View style={styles.tabWrap}>
          <Svg width={60} height={14} style={styles.tab}>
            <Path d="M 0 14 C 10 14 12 0 26 0 L 34 0 C 48 0 50 14 60 14 Z" fill="#FFFFFF" />
          </Svg>
          <Svg width={25} height={8} style={styles.arc}>
            <AnimatedPath animatedProps={arcProps} stroke="rgba(22,19,15,0.28)" strokeWidth={2} strokeLinecap="round" fill="none" />
          </Svg>
          <Animated.View style={[styles.dot, { top: -6.5 }, dots]} />
          <Animated.View style={[styles.dot, { top: 6.5 }, dots]} />
        </View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  // зона касания шире язычка — по ней легко попасть пальцем
  hit: { position: 'absolute', top: -22, alignSelf: 'center', width: 120, height: 40, alignItems: 'center', zIndex: 10 },
  tabWrap: { width: 60, height: 22, marginTop: 9, alignItems: 'center' },
  tab: { position: 'absolute', top: 0, shadowColor: '#17120D', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: -2 } },
  arc: { position: 'absolute', top: 7.5 },
  dot: { position: 'absolute', alignSelf: 'center', marginTop: 11 - 1.25, width: 2.5, height: 2.5, borderRadius: 1.25, backgroundColor: 'rgba(22,19,15,0.28)' },
});
