// Шторка «Фото профиля» (A6, D4; утверждено 11.10) — как C2: «Снять» и «Из галереи».
// Закрыть — смахнуть вниз или тап по затемнению.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';
import { Icon } from '@/components/Icon';
import { D, F, SHEET_SPRING } from '@/lib/design';

export function PhotoSource({ onPick, onClose }: { onPick: (src: 'camera' | 'gallery') => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const drag = useSharedValue(0);
  const spring = SlideInDown.springify().damping(SHEET_SPRING.damping).stiffness(SHEET_SPRING.stiffness).mass(SHEET_SPRING.mass);
  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .onUpdate((e) => {
      drag.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 80 || e.velocityY > 800) scheduleOnRN(onClose);
      else drag.value = withSpring(0, SHEET_SPRING);
    });
  const st = useAnimatedStyle(() => ({ transform: [{ translateY: drag.value }] }));
  return (
    <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(160)} style={styles.dim}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Закрыть" />
      <GestureDetector gesture={pan}>
        <Animated.View entering={spring} exiting={SlideOutDown.duration(200)} style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 10 }, st]}>
          <Pressable onPress={onClose} style={styles.grip} hitSlop={{ top: 10, bottom: 6, left: 30, right: 30 }} accessibilityLabel="Закрыть">
            <Svg width={25} height={8}>
              <Path d="M 1.5 1.5 C 8.5 5 16.5 5 23.5 1.5" stroke="rgba(22,19,15,0.28)" strokeWidth={2} strokeLinecap="round" fill="none" />
            </Svg>
          </Pressable>
          <Text style={styles.sheetTitle}>Фото профиля</Text>
          <View style={styles.tiles}>
            <Pressable onPress={() => onPick('camera')} style={({ pressed }) => [styles.tile, { backgroundColor: D.sun }, pressed && { opacity: 0.9 }]}>
              <Icon name="camera" size={30} color={D.white} />
              <View style={styles.tileText}>
                <Text style={[styles.tileTitle, { color: D.white }]}>Снять</Text>
                <Text style={[styles.tileSub, { color: 'rgba(255,255,255,0.8)' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                  на фронтальную камеру
                </Text>
              </View>
            </Pressable>
            <Pressable onPress={() => onPick('gallery')} style={({ pressed }) => [styles.tile, { backgroundColor: D.paper }, pressed && { opacity: 0.9 }]}>
              <Icon name="gallery" size={30} color={D.ink} />
              <View style={styles.tileText}>
                <Text style={styles.tileTitle}>Из галереи</Text>
                <Text style={styles.tileSub} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                  выберите снимок
                </Text>
              </View>
            </Pressable>
          </View>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // шторка «Фото профиля» — те же размеры, что C2
  dim: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(15,14,12,0.45)', justifyContent: 'flex-end', zIndex: 10 },
  sheet: {
    backgroundColor: D.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    shadowColor: '#17120D',
    shadowOpacity: 0.14,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: -6 },
  },
  grip: { alignSelf: 'center', height: 26, paddingTop: 9 },
  sheetTitle: { fontFamily: F.serifItalic, fontSize: 30, lineHeight: 40, color: D.ink },
  tiles: { flexDirection: 'row', gap: 13, marginTop: 16 },
  tile: { flex: 1, height: 140, borderRadius: 22, padding: 18, justifyContent: 'space-between' },
  tileText: { gap: 4 },
  tileTitle: { fontFamily: F.sansSemi, fontSize: 16, lineHeight: 20, color: D.ink },
  tileSub: { fontFamily: F.sans, fontSize: 12, lineHeight: 16, color: D.ink60 },
});
