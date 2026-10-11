// A6 · Создание профиля (только новые пользователи): имя обязательно, ник уникальный, фото — по желанию
import { Image } from 'expo-image';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { decode } from 'base64-arraybuffer';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';
import { Icon } from '@/components/Icon';
import { useAuth } from '@/lib/auth';
import { D, F, SHEET_SPRING } from '@/lib/design';
import { leaveAuth } from '@/lib/onboarding';
import { supabase } from '@/lib/supabase';

type Nick = 'empty' | 'invalid' | 'checking' | 'free' | 'taken';
const NICK_RE = /^[a-z0-9_.]{3,30}$/;

export default function ProfileSetup() {
  const insets = useSafeAreaInsets();
  const { session, profile, refreshProfile } = useAuth();
  const [name, setName] = useState('');
  const [nick, setNick] = useState('');
  const [nickState, setNickState] = useState<Nick>('empty');
  const [focus, setFocus] = useState<'name' | 'nick' | null>(null);
  const [avatar, setAvatar] = useState<{ uri: string; base64: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Подсказка ника — из почты
  useEffect(() => {
    const prefix = (session?.user.email ?? '').split('@')[0].toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 30);
    if (prefix.length >= 3) setNick((n) => n || prefix);
  }, [session?.user.email]);

  // Ник: формат и уникальность (с паузой)
  useEffect(() => {
    const n = nick.trim().toLowerCase();
    if (!n) return setNickState('empty');
    if (!NICK_RE.test(n)) return setNickState('invalid');
    setNickState('checking');
    const t = setTimeout(async () => {
      const { data } = await supabase.from('profiles').select('id').eq('username', n).maybeSingle();
      setNickState(!data || data.id === session?.user.id ? 'free' : 'taken');
    }, 400);
    return () => clearTimeout(t);
  }, [nick, session?.user.id]);

  // Фото профиля: шторка «Снять» / «Из галереи» (утверждено 11.10)
  const [sourceOpen, setSourceOpen] = useState(false);
  const pickAvatar = async (src: 'camera' | 'gallery') => {
    setSourceOpen(false);
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 };
    let res: ImagePicker.ImagePickerResult;
    if (src === 'camera') {
      // доступ к камере спрашиваем только сейчас — при первой съёмке (как обещает A7)
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        return Alert.alert('Нет доступа к камере', 'Разрешите DreamApp пользоваться камерой в настройках — или выберите фото из галереи.', [
          { text: 'Отмена', style: 'cancel' },
          { text: 'Открыть настройки', onPress: () => Linking.openSettings() },
        ]);
      }
      res = await ImagePicker.launchCameraAsync({ ...opts, cameraType: ImagePicker.CameraType.front });
    } else {
      res = await ImagePicker.launchImageLibraryAsync(opts);
    }
    if (res.canceled || !res.assets?.[0]) return;
    const ctx = ImageManipulator.ImageManipulator.manipulate(res.assets[0].uri);
    ctx.resize({ width: 400, height: null });
    const img = await (await ctx.renderAsync()).saveAsync({ format: ImageManipulator.SaveFormat.JPEG, compress: 0.8, base64: true });
    setAvatar({ uri: img.uri, base64: img.base64 ?? '' });
  };

  const ready = name.trim().length > 0 && nickState === 'free' && !busy;
  const save = async () => {
    if (!session || !ready) return;
    setBusy(true);
    try {
      let avatar_url = profile?.avatar_url ?? null;
      if (avatar?.base64) {
        const path = `${session.user.id}/avatar-${Date.now()}.jpg`;
        const up = await supabase.storage.from('photos').upload(path, decode(avatar.base64), { contentType: 'image/jpeg', upsert: true });
        if (up.error) throw up.error;
        avatar_url = supabase.storage.from('photos').getPublicUrl(path).data.publicUrl;
      }
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: name.trim(), username: nick.trim().toLowerCase(), avatar_url })
        .eq('id', session.user.id);
      if (error) throw error;
      await refreshProfile();
      router.replace('/permissions');
    } catch (e: any) {
      if (String(e?.message).includes('profiles_username_key')) setNickState('taken');
      else Alert.alert('Не получилось сохранить', 'Проверьте интернет и попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  };

  const hint =
    nickState === 'free'
      ? 'Ник свободен. Так вас найдут другие — его можно поменять позже.'
      : nickState === 'taken'
        ? 'Этот ник уже занят — попробуйте другой.'
        : nickState === 'invalid'
          ? 'Латиница, цифры, точка и _ — от 3 до 30 символов.'
          : nickState === 'checking'
            ? 'Проверяем…'
            : '';

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: D.paper }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 9, paddingHorizontal: 32 }} keyboardShouldPersistTaps="handled">
        <Pressable onPress={leaveAuth} style={[styles.round, { marginLeft: -16 }]} accessibilityLabel="Назад">
          <Icon name="back" size={20} color={D.ink} />
        </Pressable>
        <Text style={styles.step}>ПОСЛЕДНИЙ ШАГ</Text>
        <Text style={styles.title}>Как вас зовут?</Text>

        <Pressable onPress={() => { Keyboard.dismiss(); setSourceOpen(true); }} style={styles.avatarWrap} accessibilityLabel={avatar ? 'Сменить фото' : 'Добавить фото'}>
          {avatar ? <Image source={{ uri: avatar.uri }} style={styles.avatarImg} /> : <View style={styles.avatar}><Icon name="camera" size={32} color={D.ink60} /></View>}
          <Text style={styles.addPhoto}>{avatar ? 'Сменить фото' : 'Добавить фото'}</Text>
        </Pressable>

        <Text style={[styles.label, { marginTop: 30 }]}>ИМЯ</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          onFocus={() => setFocus('name')}
          onBlur={() => setFocus(null)}
          placeholder="Как к вам обращаться"
          placeholderTextColor={D.ink40}
          selectionColor={D.sun}
          autoCapitalize="words"
          textContentType="name"
          maxLength={60}
          style={[styles.field, focus === 'name' && styles.fieldOn]}
        />

        <Text style={[styles.label, { marginTop: 19 }]}>НИК</Text>
        <View style={[styles.fieldRow, focus === 'nick' && styles.fieldOn]}>
          <Text style={styles.at}>@</Text>
          <TextInput
            value={nick}
            onChangeText={(t) => setNick(t.toLowerCase().replace(/^@/, ''))}
            onFocus={() => setFocus('nick')}
            onBlur={() => setFocus(null)}
            selectionColor={D.sun}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={30}
            style={styles.nickInput}
          />
          {nickState === 'free' && <Icon name="check" size={18} color={D.sun} />}
          {nickState === 'checking' && <ActivityIndicator size="small" color={D.ink40} />}
        </View>
        {hint ? <Text style={[styles.hint, nickState === 'taken' && { color: D.sun }]}>{hint}</Text> : null}

        <View style={{ flex: 1, minHeight: 32 }} />
        <Pressable onPress={save} disabled={!ready} style={[styles.button, { marginBottom: Math.max(insets.bottom + 2, 16) }, !ready && { opacity: 0.45 }]}>
          {busy ? <ActivityIndicator color={D.white} /> : <Text style={styles.buttonText}>Готово</Text>}
        </Pressable>
      </ScrollView>
      {sourceOpen && <PhotoSource onPick={pickAvatar} onClose={() => setSourceOpen(false)} />}
    </KeyboardAvoidingView>
  );
}

/** A6 · шторка «Фото профиля» — как C2: «Снять» и «Из галереи». Закрыть — смахнуть вниз или тап по затемнению */
function PhotoSource({ onPick, onClose }: { onPick: (src: 'camera' | 'gallery') => void; onClose: () => void }) {
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
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: D.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#17120D',
    shadowOpacity: 0.14,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
  },
  step: { marginTop: 20, fontFamily: F.mono, fontSize: 12, lineHeight: 16, letterSpacing: 0.96, color: D.sun },
  title: { marginTop: 6, fontFamily: F.serif, fontSize: 36, lineHeight: 48, color: D.ink },
  avatarWrap: { alignSelf: 'center', alignItems: 'center', marginTop: 30 },
  avatar: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: D.ink40,
    backgroundColor: D.mapBase,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: { width: 112, height: 112, borderRadius: 56, backgroundColor: D.paper2 },
  addPhoto: { marginTop: 12, fontFamily: F.sansSemi, fontSize: 14, color: D.sun },
  label: { fontFamily: F.mono, fontSize: 11, lineHeight: 15, letterSpacing: 0.88, color: D.ink60, marginBottom: 5 },
  field: {
    height: 55,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: D.line,
    backgroundColor: D.white,
    paddingHorizontal: 16,
    fontFamily: F.sans,
    fontSize: 16,
    color: D.ink,
  },
  fieldOn: { borderWidth: 1.5, borderColor: D.sun },
  fieldRow: { height: 55, borderRadius: 16, borderWidth: 1, borderColor: D.line, backgroundColor: D.white, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 2 },
  at: { fontFamily: F.sans, fontSize: 16, color: D.ink },
  nickInput: { flex: 1, height: '100%', fontFamily: F.sans, fontSize: 16, color: D.ink, padding: 0 },
  hint: { marginTop: 8, fontFamily: F.sans, fontSize: 13, lineHeight: 18, color: D.ink60 },
  button: { backgroundColor: D.sun, borderRadius: 999, paddingVertical: 17, alignItems: 'center' },
  buttonText: { fontFamily: F.sansSemi, fontSize: 16, lineHeight: 20, color: D.white },
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
