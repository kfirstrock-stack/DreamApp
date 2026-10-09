// A1–A3 · Онбординг: показываем один раз при первом запуске. «Пропустить» и «Начать» → A4 (вход)
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

// Иллюстрации — в координатах макета (393×852), масштабируются под экран
function useArt() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const s = Math.min(width / 393, height / 852);
  const dx = (width - 393 * s) / 2;
  const at = (x: number, y: number, w: number, h: number) => ({
    position: 'absolute' as const,
    left: dx + x * s,
    top: insets.top + (y - 47) * s,
    width: w * s,
    height: h * s,
  });
  return { at, s, insets };
}

export default function Welcome() {
  const { width } = useWindowDimensions();
  const scroll = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const toSignIn = () => router.replace('/sign-in');
  const next = () => (page < 2 ? scroll.current?.scrollTo({ x: width * (page + 1), animated: true }) : toSignIn());

  return (
    <View style={{ flex: 1, backgroundColor: page === 0 ? D.night : D.paper }}>
      <StatusBar style={page === 0 ? 'light' : 'dark'} />
      <ScrollView
        ref={scroll}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
      >
        <A1 width={width} onSkip={toSignIn} onNext={next} />
        <A2 width={width} onSkip={toSignIn} onNext={next} />
        <A3 width={width} onStart={toSignIn} />
      </ScrollView>
    </View>
  );
}

function Dots({ i, dark }: { i: number; dark: boolean }) {
  return (
    <View style={styles.dots}>
      {[0, 1, 2].map((k) => (
        <View key={k} style={[styles.dot, k === i ? styles.dotOn : { backgroundColor: dark ? 'rgba(244,239,230,0.25)' : 'rgba(22,19,15,0.25)' }]} />
      ))}
    </View>
  );
}

function Bottom({ i, dark, onNext }: { i: number; dark: boolean; onNext: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bottomRow, { bottom: insets.bottom - 4 }]}>
      <Dots i={i} dark={dark} />
      <Pressable onPress={onNext} style={({ pressed }) => [styles.arrow, pressed && { opacity: 0.88 }]} accessibilityLabel="Дальше">
        <Icon name="arrow" size={27.6} color={D.white} />
      </Pressable>
    </View>
  );
}

function Skip({ dark, onPress }: { dark: boolean; onPress: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Pressable onPress={onPress} hitSlop={12} style={[styles.skip, { top: insets.top + 11 }]}>
      <Text style={[styles.skipText, { color: dark ? 'rgba(244,239,230,0.8)' : D.ink60 }]}>Пропустить</Text>
    </Pressable>
  );
}

function A1({ width, onSkip, onNext }: { width: number; onSkip: () => void; onNext: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ width, flex: 1, backgroundColor: D.night }}>
      <Image source={ART.a1} style={StyleSheet.absoluteFill} contentFit="cover" />
      <View style={styles.shade} />
      <Skip dark onPress={onSkip} />
      <View style={[styles.textBlock, { bottom: insets.bottom + 94 }]}>
        <Text style={styles.step}>01 / 03</Text>
        <Text style={[styles.title, { color: D.paper }]}>Каждое место помнит всех, кто там был</Text>
        <Text style={[styles.body, { color: 'rgba(244,239,230,0.62)' }]}>DreamApp — живая история мест в фотографиях людей, которые там были.</Text>
      </View>
      <Bottom i={0} dark onNext={onNext} />
    </View>
  );
}

function A2({ width, onSkip, onNext }: { width: number; onSkip: () => void; onNext: () => void }) {
  const { at, insets } = useArt();
  return (
    <View style={{ width, flex: 1, backgroundColor: D.paper }}>
      <Skip dark={false} onPress={onSkip} />
      <Image source={ART.a2map} style={at(32, 100, 329, 300)} contentFit="contain" />
      <Image source={ART.a2time} style={at(22, 320, 349, 180)} contentFit="contain" />
      <View style={[styles.textBlock, { bottom: insets.bottom + 91 }]}>
        <Text style={styles.step}>02 / 03</Text>
        <Text style={styles.title}>Выбирайте не только «где», но и «когда»</Text>
        <Text style={styles.body}>Листайте время до минуты и смотрите, что происходило здесь год или пять лет назад.</Text>
      </View>
      <Bottom i={1} dark={false} onNext={onNext} />
    </View>
  );
}

function A3({ width, onStart }: { width: number; onStart: () => void }) {
  const { at, s, insets } = useArt();
  return (
    <View style={{ width, flex: 1, backgroundColor: D.paper }}>
      <Image source={ART.a3left} style={at(14.56, 84.44, 249, 285.33)} contentFit="contain" />
      <Image source={ART.a3right} style={at(144.85, 134.43, 245.67, 283.33)} contentFit="contain" />
      <Image source={ART.a3dash} style={at(119.2, 359.4, 161.67, 49.67)} contentFit="contain" />
      <View style={[at(132, 404, 0, 0), styles.chipWrap]}>
        <View style={[styles.chip, { transform: [{ scale: s }] }]}>
          <Text style={styles.chipText}>≈ 60 м · 2 минуты</Text>
        </View>
      </View>
      <View style={[styles.textBlock, { bottom: insets.bottom + 125 }]}>
        <Text style={styles.step}>03 / 03</Text>
        <Text style={styles.title}>Найдите себя на чужих фото</Text>
        <Text style={styles.body}>Сравним место и время ваших снимков с чужими и покажем, где вы могли попасть в кадр.</Text>
        <View style={styles.privacy}>
          <Icon name="lock" size={18} color={D.ink60} />
          <Text style={styles.privacyText}>Публикуется только то, что выберете вы</Text>
        </View>
      </View>
      <Pressable onPress={onStart} style={({ pressed }) => [styles.button, { bottom: insets.bottom + 2 }, pressed && { opacity: 0.88 }]}>
        <Text style={styles.buttonText}>Начать</Text>
      </Pressable>
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
  skip: { position: 'absolute', right: 24, zIndex: 5 },
  skipText: { fontFamily: F.sansMedium, fontSize: 15 },
  textBlock: { position: 'absolute', left: 32, right: 32 },
  step: { fontFamily: F.mono, fontSize: 12, lineHeight: 16, letterSpacing: 0.96, color: D.sun },
  title: { marginTop: 10, fontFamily: F.serif, fontSize: 34, lineHeight: 40, color: D.ink },
  body: { marginTop: 12, maxWidth: 320, fontFamily: F.sans, fontSize: 16, lineHeight: 23, color: 'rgba(22,19,15,0.62)' },
  privacy: { marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 10 },
  privacyText: { fontFamily: F.sans, fontSize: 14, color: D.ink60 },
  bottomRow: { position: 'absolute', left: 32, right: 32, height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  dotOn: { width: 22, backgroundColor: D.sun },
  arrow: { width: 60, height: 60, borderRadius: 30, backgroundColor: D.sun, alignItems: 'center', justifyContent: 'center' },
  chipWrap: { overflow: 'visible' },
  chip: { position: 'absolute', left: 0, top: 0, transformOrigin: 'left top', backgroundColor: D.sun, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontFamily: F.mono, fontSize: 12, color: D.white },
  button: { position: 'absolute', left: 32, right: 32, backgroundColor: D.sun, borderRadius: 999, paddingVertical: 17, alignItems: 'center' },
  buttonText: { fontFamily: F.sansSemi, fontSize: 16, lineHeight: 20, color: D.white },
});
