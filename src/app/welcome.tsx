// A1–A3 · Онбординг: показываем один раз при первом запуске. «Пропустить» и «Начать» → A4 (вход)
// Переходы: свой пейджер на жесте, слои двигаются с разной скоростью (параллакс), смена экрана — по кривой, не линейно.
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Children, type ReactNode, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  interpolateColor,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { Icon } from '@/components/Icon';
import { D, F } from '@/lib/design';

const ART = {
  a1: require('../../assets/onboarding/a1-photo.jpg'),
  a2map: require('../../assets/onboarding/a2-map.png'),
  a2time: require('../../assets/onboarding/a2-time.png'),
  a3left: require('../../assets/onboarding/a3-left.png'),
  a3right: require('../../assets/onboarding/a3-right.png'),
  a3dash: require('../../assets/onboarding/a3-dash.png'),
};

const LAST = 2;
// Кнопка «дальше»: медленный старт, быстрая середина, мягкая остановка
const EASE = Easing.bezier(0.76, 0, 0.24, 1);
const SPRING = { damping: 20, stiffness: 120, mass: 1 };

type P = SharedValue<number>;

// Слой страницы i. d = progress − i: 0 — страница на экране, ±1 — ушла влево/вправо.
// k — скорость относительно пальца (параллакс), fade — на каком |d| слой гаснет,
// rot — поворот в градусах на |d| = 1, lift — сдвиг вниз на |d| = 1, grow — изменение масштаба.
type Layer = { k?: number; fade?: number; rot?: number; lift?: number; grow?: number };
function useLayer(progress: P, i: number, width: number, { k = 1, fade = 0, rot = 0, lift = 0, grow = 0 }: Layer) {
  return useAnimatedStyle(() => {
    const d = progress.value - i;
    const a = Math.abs(d);
    return {
      opacity: fade ? interpolate(a, [0, fade], [1, 0], Extrapolation.CLAMP) : 1,
      transform: [{ translateX: -d * width * k }, { translateY: a * lift }, { rotate: `${d * rot}deg` }, { scale: 1 + a * grow }],
    };
  });
}

// Иллюстрации — в координатах макета (393×852), масштабируются под экран.
// На невысоких экранах (iPhone XS) уменьшаем их ещё, чтобы до текста оставался отступ из макета.
function useArt(artBottom: number, gap: number) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [textTop, setTextTop] = useState<number | null>(null);
  const fit = textTop == null ? 1 : (textTop - gap - insets.top) / (artBottom - 47);
  const s = Math.min(width / 393, height / 852, fit);
  const dx = (width - 393 * s) / 2;
  const at = (x: number, y: number, w: number, h: number) => ({
    position: 'absolute' as const,
    left: dx + x * s,
    top: insets.top + (y - 47) * s,
    width: w * s,
    height: h * s,
  });
  const onText = (e: { nativeEvent: { layout: { y: number } } }) => setTextTop(e.nativeEvent.layout.y);
  return { at, s, insets, onText };
}

export default function Welcome() {
  const { width } = useWindowDimensions();
  const progress = useSharedValue(0);
  const start = useSharedValue(0);
  const [page, setPage] = useState(0);
  const toSignIn = () => router.replace('/sign-in');

  useAnimatedReaction(
    () => Math.round(progress.value),
    (p, prev) => {
      if (p !== prev) scheduleOnRN(setPage, p);
    },
  );

  const next = () => {
    if (page >= LAST) return toSignIn();
    progress.value = withTiming(page + 1, { duration: 820, easing: EASE });
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-20, 20])
    .onBegin(() => {
      start.value = progress.value;
    })
    .onUpdate((e) => {
      let p = start.value - e.translationX / width;
      if (p < 0) p = p / 4; // резинка у краёв
      if (p > LAST) p = LAST + (p - LAST) / 4;
      progress.value = p;
    })
    .onEnd((e) => {
      const v = -e.velocityX / width;
      let target = Math.round(progress.value);
      if (v > 0.5) target = Math.ceil(progress.value);
      if (v < -0.5) target = Math.floor(progress.value);
      target = Math.max(0, Math.min(LAST, target));
      progress.value = withSpring(target, { ...SPRING, velocity: v });
    });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={{ flex: 1, backgroundColor: D.paper }}>
        <StatusBar style={page === 0 ? 'light' : 'dark'} />
        {/* A1 — верхний слой: тёмная «шторка» уезжает и открывает бумагу A2 под собой */}
        <A2 progress={progress} width={width} />
        <A3 progress={progress} width={width} />
        <A1 progress={progress} width={width} />
        <Skip progress={progress} active={page < LAST} onPress={toSignIn} />
        <Bottom progress={progress} onNext={next} />
      </Animated.View>
    </GestureDetector>
  );
}

function Skip({ progress, active, onPress }: { progress: P; active: boolean; onPress: () => void }) {
  const insets = useSafeAreaInsets();
  const wrap = useAnimatedStyle(() => ({ opacity: interpolate(progress.value, [1, 1.5], [1, 0], Extrapolation.CLAMP) }));
  const light = useAnimatedStyle(() => ({ opacity: interpolate(progress.value, [0, 0.6], [1, 0], Extrapolation.CLAMP) }));
  const dark = useAnimatedStyle(() => ({ opacity: interpolate(progress.value, [0.4, 1], [0, 1], Extrapolation.CLAMP) }));
  return (
    <Animated.View pointerEvents={active ? 'auto' : 'none'} style={[styles.skip, { top: insets.top + 11 }, wrap]}>
      <Pressable onPress={onPress} hitSlop={12}>
        <Animated.Text style={[styles.skipText, { color: D.ink60 }, dark]}>Пропустить</Animated.Text>
        <Animated.Text style={[styles.skipText, styles.skipOver, { color: 'rgba(244,239,230,0.8)' }, light]}>Пропустить</Animated.Text>
      </Pressable>
    </Animated.View>
  );
}

function Dot({ progress, k }: { progress: P; k: number }) {
  const st = useAnimatedStyle(() => {
    const on = interpolate(Math.abs(progress.value - k), [0, 1], [1, 0], Extrapolation.CLAMP);
    const off = interpolateColor(progress.value, [0, 1], ['rgba(244,239,230,0.25)', 'rgba(22,19,15,0.25)']);
    return { width: 7 + 15 * on, backgroundColor: interpolateColor(on, [0, 1], [off, D.sun]) };
  });
  return <Animated.View style={[styles.dot, st]} />;
}

function Bottom({ progress, onNext }: { progress: P; onNext: () => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // Круглая стрелка на пути к A3 вытягивается влево в длинную кнопку «Начать» (как в макете A3)
  const dots = useAnimatedStyle(() => ({ opacity: interpolate(progress.value, [1, 1.35], [1, 0], Extrapolation.CLAMP) }));
  const btn = useAnimatedStyle(() => {
    const v = Math.min(1, Math.max(0, progress.value - 1));
    const k = v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; // плавный разгон и мягкая посадка
    const h = 60 - 6 * k;
    return {
      width: 60 + (width - 64 - 60) * k,
      height: h,
      borderRadius: h / 2,
      bottom: insets.bottom - 4 + 6 * k,
    };
  });
  const arrow = useAnimatedStyle(() => {
    const v = Math.min(1, Math.max(0, progress.value - 1));
    return {
      opacity: interpolate(v, [0, 0.35], [1, 0], Extrapolation.CLAMP),
      transform: [{ translateX: interpolate(v, [0, 0.35], [0, 14], Extrapolation.CLAMP) }],
    };
  });
  const label = useAnimatedStyle(() => {
    const v = Math.min(1, Math.max(0, progress.value - 1));
    return {
      opacity: interpolate(v, [0.55, 1], [0, 1], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(v, [0.55, 1], [0.92, 1], Extrapolation.CLAMP) }],
    };
  });
  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.dotsRow, { bottom: insets.bottom - 4 }, dots]}>
        <View style={styles.dots}>
          {[0, 1, 2].map((k) => (
            <Dot key={k} progress={progress} k={k} />
          ))}
        </View>
      </Animated.View>
      <Animated.View style={[styles.morph, btn]}>
        <Pressable onPress={onNext} style={({ pressed }) => [styles.morphPress, pressed && { opacity: 0.88 }]} accessibilityRole="button">
          <Animated.View style={[styles.morphCenter, arrow]}>
            <Icon name="arrow" size={27.6} color={D.white} />
          </Animated.View>
          <Animated.View style={[styles.morphCenter, label]}>
            <Text style={styles.buttonText} numberOfLines={1}>
              Начать
            </Text>
          </Animated.View>
        </Pressable>
      </Animated.View>
    </>
  );
}

// Текст: метка, заголовок и подпись уходят с разной скоростью — «лесенкой»
function TextBlock({ progress, i, width, bottom, onLayout, children }: {
  progress: P; i: number; width: number; bottom: number; onLayout?: (e: { nativeEvent: { layout: { y: number } } }) => void;
  children: ReactNode;
}) {
  const parts = Children.toArray(children);
  const s0 = useLayer(progress, i, width, { k: 0.85, fade: 0.55 });
  const s1 = useLayer(progress, i, width, { k: 1.1, fade: 0.6 });
  const s2 = useLayer(progress, i, width, { k: 1.4, fade: 0.65 });
  const s3 = useLayer(progress, i, width, { k: 1.6, fade: 0.65 });
  return (
    <View onLayout={onLayout} pointerEvents="none" style={[styles.textBlock, { bottom }]}>
      <Animated.View style={s0}>{parts[0]}</Animated.View>
      <Animated.View style={s1}>{parts[1]}</Animated.View>
      <Animated.View style={s2}>{parts[2]}</Animated.View>
      {parts[3] ? <Animated.View style={s3}>{parts[3]}</Animated.View> : null}
    </View>
  );
}

function A1({ progress, width }: { progress: P; width: number }) {
  const insets = useSafeAreaInsets();
  // Шторка A1 уходит вместе с пальцем, а фото внутри — вдвое медленнее и чуть приближается (параллакс).
  // Без полупрозрачности: тёмное и бумага не смешиваются в грязный серый.
  const curtain = useAnimatedStyle(() => ({
    transform: [{ translateX: -Math.max(0, progress.value) * width }],
  }));
  const photo = useAnimatedStyle(() => {
    const d = Math.max(0, progress.value);
    return { transform: [{ translateX: d * width * 0.55 }, { scale: 1 + d * 0.12 }] };
  });
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.curtain, curtain]}>
        <Animated.View style={[StyleSheet.absoluteFill, photo]}>
          <Image source={ART.a1} style={StyleSheet.absoluteFill} contentFit="cover" />
          <View style={styles.shade} />
        </Animated.View>
      </Animated.View>
      <TextBlock progress={progress} i={0} width={width} bottom={insets.bottom + 94}>
        <Text style={styles.step}>01 / 03</Text>
        <Text style={[styles.title, { color: D.paper }]}>Каждое место помнит всех, кто там был</Text>
        <Text style={[styles.body, { color: 'rgba(244,239,230,0.62)' }]}>DreamApp — живая история мест в фотографиях людей, которые там были.</Text>
      </TextBlock>
    </View>
  );
}

function A2({ progress, width }: { progress: P; width: number }) {
  const { at, insets, onText } = useArt(460, 40); // карточка времени → «02 / 03»
  // Карта — дальний план (медленно, с лёгким отдалением), карточка времени — ближний (быстрее, с наклоном)
  const map = useLayer(progress, 1, width, { k: 0.55, fade: 0.8, grow: -0.08 });
  const card = useLayer(progress, 1, width, { k: 1.3, fade: 0.9, rot: -5, lift: 24 });
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[at(32, 100, 329, 300), map]}>
        <Image source={ART.a2map} style={StyleSheet.absoluteFill} contentFit="contain" />
      </Animated.View>
      <Animated.View style={[at(22, 320, 349, 180), card]}>
        <Image source={ART.a2time} style={StyleSheet.absoluteFill} contentFit="contain" />
      </Animated.View>
      <TextBlock progress={progress} i={1} width={width} bottom={insets.bottom + 91} onLayout={onText}>
        <Text style={styles.step}>02 / 03</Text>
        <Text style={styles.title}>Выбирайте не только «где», но и «когда»</Text>
        <Text style={styles.body}>Листайте время с точностью до 15{' '}минут и смотрите, что происходило здесь год или пять лет назад.</Text>
      </TextBlock>
    </View>
  );
}

function A3({ progress, width }: { progress: P; width: number }) {
  const { at, s, insets, onText } = useArt(428, 42); // чип расстояния → «03 / 03»
  // Два снимка прилетают с разной скоростью и докручиваются до своего наклона; пунктир и чип проявляются последними
  const left = useLayer(progress, 2, width, { k: 0.7, fade: 0.9, rot: 10, lift: 20 });
  const right = useLayer(progress, 2, width, { k: 1.2, fade: 0.9, rot: -8, lift: 36 });
  const link = useAnimatedStyle(() => {
    const a = Math.abs(progress.value - 2);
    return {
      opacity: interpolate(a, [0, 0.35], [1, 0], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(a, [0, 0.35], [1, 0.85], Extrapolation.CLAMP) }],
    };
  });
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View pointerEvents="none" style={[at(14.56, 84.44, 249, 285.33), left]}>
        <Image source={ART.a3left} style={StyleSheet.absoluteFill} contentFit="contain" />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[at(144.85, 134.43, 245.67, 283.33), right]}>
        <Image source={ART.a3right} style={StyleSheet.absoluteFill} contentFit="contain" />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, link]}>
        <Image source={ART.a3dash} style={at(119.2, 359.4, 161.67, 49.67)} contentFit="contain" />
        <View style={[at(132, 404, 0, 0), styles.chipWrap]}>
          <View style={[styles.chip, { transform: [{ scale: s }] }]}>
            <Text style={styles.chipText}>≈ 60 м · 2 минуты</Text>
          </View>
        </View>
      </Animated.View>
      <TextBlock progress={progress} i={2} width={width} bottom={insets.bottom + 125} onLayout={onText}>
        <Text style={styles.step}>03 / 03</Text>
        <Text style={styles.title}>Найдите себя на чужих фото</Text>
        <Text style={styles.body}>Сравним место и время ваших снимков с чужими и покажем, где вы могли попасть в кадр.</Text>
        <View style={styles.privacy}>
          <Icon name="lock" size={18} color={D.ink60} />
          <Text style={styles.privacyText}>Публикуется только то, что выберете вы</Text>
        </View>
      </TextBlock>
    </View>
  );
}

const styles = StyleSheet.create({
  shade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '66%',
    experimental_backgroundImage: 'linear-gradient(180deg, rgba(15,14,12,0) 0%, #0F0E0C 100%)',
  },
  curtain: { backgroundColor: D.night, overflow: 'hidden' },
  skip: { position: 'absolute', right: 24, zIndex: 5 },
  skipText: { fontFamily: F.sansMedium, fontSize: 15 },
  skipOver: { position: 'absolute', left: 0, top: 0 },
  textBlock: { position: 'absolute', left: 32, right: 32 },
  step: { fontFamily: F.mono, fontSize: 12, lineHeight: 16, letterSpacing: 0.96, color: D.sun },
  title: { marginTop: 10, fontFamily: F.serif, fontSize: 34, lineHeight: 40, color: D.ink },
  body: { marginTop: 12, maxWidth: 320, fontFamily: F.sans, fontSize: 16, lineHeight: 23, color: 'rgba(22,19,15,0.62)' },
  privacy: { marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 10 },
  privacyText: { fontFamily: F.sans, fontSize: 14, color: D.ink60 },
  dotsRow: { position: 'absolute', left: 32, height: 60, justifyContent: 'center' },
  morph: { position: 'absolute', right: 32, backgroundColor: D.sun, overflow: 'hidden' },
  morphPress: { flex: 1 },
  morphCenter: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  chipWrap: { overflow: 'visible' },
  chip: { position: 'absolute', left: 0, top: 0, transformOrigin: 'left top', backgroundColor: D.sun, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontFamily: F.mono, fontSize: 12, color: D.white },
  buttonText: { fontFamily: F.sansSemi, fontSize: 16, lineHeight: 20, color: D.white },
});
