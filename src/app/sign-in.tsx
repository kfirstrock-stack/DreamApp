// A4 · Вход по почте и A5 · Ввод кода (8 цифр, Supabase OTP). Новый пользователь → A6, иначе — назад
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, Extrapolation, interpolate, type SharedValue, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { D, F } from '@/lib/design';
import { leaveAuth, markOnboarded } from '@/lib/onboarding';
import { supabase } from '@/lib/supabase';

const CODE = 8;
const RESEND = 60;
const ART = {
  left: require('../../assets/onboarding/a4-left.png'),
  right: require('../../assets/onboarding/a4-right.png'),
  center: require('../../assets/onboarding/a4-center.png'),
};

export default function SignIn() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  // Появление A4 после онбординга: снимки и текст влетают (один раз — при возврате с A5 уже без него)
  const enter = useSharedValue(from === 'welcome' ? 0 : 1);
  useEffect(() => {
    if (enter.value < 1) enter.value = withTiming(1, { duration: 1100, easing: Easing.bezier(0.22, 1, 0.36, 1) });
  }, [enter]);
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const e = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(e)) return setError('Проверьте адрес почты');
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({ email: e, options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) return setError(/rate|seconds/i.test(error.message) ? 'Слишком часто. Подождите минуту и попробуйте снова.' : 'Не получилось отправить код. Проверьте интернет.');
    setStep('code');
  };

  if (step === 'code') return <CodeStep email={email.trim().toLowerCase()} onBack={() => setStep('email')} onResend={send} />;
  return <EmailStep email={email} setEmail={setEmail} busy={busy} error={error} onSend={send} enter={enter} />;
}

/** A4 */
// Слой появления: from — откуда влетает (dx, dy, поворот), [a, b] — когда в общей шкале 0..1
function useEnter(enter: SharedValue<number>, a: number, b: number, dx: number, dy = 0, rot = 0, sc = 0) {
  return useAnimatedStyle(() => {
    const t = interpolate(enter.value, [a, b], [0, 1], Extrapolation.CLAMP);
    const r = 1 - t;
    return {
      opacity: interpolate(t, [0, 0.4], [0, 1], Extrapolation.CLAMP),
      transform: [{ translateX: dx * r }, { translateY: dy * r }, { rotate: `${rot * r}deg` }, { scale: 1 - sc * r }],
    };
  });
}

function EmailStep({ email, setEmail, busy, error, onSend, enter }: { email: string; setEmail: (s: string) => void; busy: boolean; error: string | null; onSend: () => void; enter: SharedValue<number> }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // снимки — с разных сторон и с докруткой, центральный последним; текст — лесенкой справа, как в онбординге
  const eLeft = useEnter(enter, 0, 0.6, -width * 0.45, 30, -12);
  const eRight = useEnter(enter, 0.05, 0.65, width * 0.45, 40, 12);
  const eCenter = useEnter(enter, 0.12, 0.72, 0, 90, 6, 0.12);
  const eTag = useEnter(enter, 0.45, 0.8, 0, 10, 0, 0.3);
  const t1 = useEnter(enter, 0.22, 0.72, width * 0.25);
  const t2 = useEnter(enter, 0.27, 0.8, width * 0.32);
  const t3 = useEnter(enter, 0.32, 0.86, width * 0.4);
  const t4 = useEnter(enter, 0.38, 0.92, width * 0.46);
  const t5 = useEnter(enter, 0.44, 1, width * 0.5);
  // Клавиатура (A4 · с клавиатурой, утверждено 11.10): снимки, заголовок и подпись гаснут и уходят,
  // остаются «DreamApp», поле, кнопка и ссылка. Закрыли клавиатуру — всё возвращается.
  const kb = useSharedValue(0);
  const kbOpen = useRef(false);
  const copyH = useSharedValue(0);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      kbOpen.current = true;
      kb.value = withTiming(1, { duration: e.duration || 250, easing: Easing.out(Easing.cubic) });
    });
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', (e) => {
      kbOpen.current = false;
      kb.value = withTiming(0, { duration: e.duration || 250, easing: Easing.out(Easing.cubic) });
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [kb]);
  const artKb = useAnimatedStyle(() => ({
    opacity: 1 - kb.value,
    transform: [{ translateY: -40 * kb.value }, { scale: 1 - 0.06 * kb.value }],
  }));
  const copyKb = useAnimatedStyle(() =>
    copyH.value > 0
      ? { height: copyH.value * (1 - kb.value), opacity: interpolate(kb.value, [0, 0.5], [1, 0], Extrapolation.CLAMP) }
      : {},
  );
  // на невысоких экранах полароиды уменьшаются, чтобы до «DreamApp» оставались 32 pt, как в макете
  const [textTop, setTextTop] = useState<number | null>(null);
  const fit = textTop == null ? 1 : (textTop - 32 - insets.top) / (362 - 47);
  const s = Math.min(width / 393, height / 852, fit);
  const dx = (width - 393 * s) / 2;
  const at = (x: number, y: number, w: number, h: number) => ({ position: 'absolute' as const, left: dx + x * s, top: insets.top + (y - 47) * s, width: w * s, height: h * s });
  const guest = async () => {
    await markOnboarded();
    leaveAuth();
  };
  return (
    <View style={styles.dark}>
      <StatusBar style="light" />
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, artKb]}>
      <Animated.View style={[at(-1.68, 41.65, 276.33, 322.67), eLeft]}>
        <Image source={ART.left} style={StyleSheet.absoluteFill} contentFit="contain" />
      </Animated.View>
      <Animated.View style={[at(178.9, 100.7, 225.67, 285.33), eRight]}>
        <Image source={ART.right} style={StyleSheet.absoluteFill} contentFit="contain" />
      </Animated.View>
      <Animated.View style={[at(65.1, 56.2, 274.67, 324.67), eCenter]}>
        <Image source={ART.center} style={StyleSheet.absoluteFill} contentFit="contain" />
      </Animated.View>
      <Animated.View style={[at(176, 338, 0, 0), { overflow: 'visible' }, eTag]}>
        <View style={[styles.placeTag, { transform: [{ scale: s }] }]}>
          <Icon name="pin" size={14} color={D.white} />
          <Text style={styles.placeTagText}>Исаакиевская пл.</Text>
        </View>
      </Animated.View>
      </Animated.View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.bottom} keyboardVerticalOffset={-insets.bottom + 16}>
        <View onLayout={(e) => !kbOpen.current && setTextTop(height - e.nativeEvent.layout.height)} style={{ paddingHorizontal: 32, paddingBottom: Math.max(insets.bottom - 3 - 13, 0) }}>
          <Animated.Text style={[styles.brand, t1]}>DreamApp</Animated.Text>
          <Animated.View style={[{ overflow: 'hidden' }, copyKb]}>
            <View onLayout={(e) => (copyH.value = copyH.value || e.nativeEvent.layout.height)}>
              <Animated.Text style={[styles.a4Title, t2]}>Каждое место помнит всех, кто там был</Animated.Text>
              <Animated.Text style={[styles.a4Body, t3]}>Выкладывайте снимки с местом и временем — и находите себя на чужих фото.</Animated.Text>
            </View>
          </Animated.View>
          <Animated.View style={t4}>
          <View style={styles.field}>
            <Icon name="mail" size={20} color={D.paper} />
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Ваша почта"
              placeholderTextColor="rgba(244,239,230,0.45)"
              selectionColor={D.sun}
              keyboardType="email-address"
              keyboardAppearance="dark"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="send"
              onSubmitEditing={onSend}
              style={styles.input}
            />
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          </Animated.View>
          <Animated.View style={t5}>
            <Pressable onPress={onSend} disabled={busy} style={({ pressed }) => [styles.button, { marginTop: 12 }, pressed && { opacity: 0.88 }]}>
              {busy ? <ActivityIndicator color={D.white} /> : <Text style={styles.buttonText}>Получить код</Text>}
            </Pressable>
            {/* G1 · гостевой вход (утверждено 09.10); «Продолжить с Apple» — в сборке для App Store */}
            {/* 32 pt от кнопки до ссылки и зона нажатия 45 pt, которая не заходит на кнопку — чтобы не промахнуться */}
            <Pressable onPress={guest} hitSlop={{ left: 16, right: 16 }} style={{ alignSelf: 'center', marginTop: 32 - 13, paddingVertical: 13 }}>
              <Text style={styles.guest}>Смотреть карту без входа</Text>
            </Pressable>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

/** A5 */
function CodeStep({ email, onBack, onResend }: { email: string; onBack: () => void; onResend: () => Promise<void> }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [left, setLeft] = useState(RESEND);
  const input = useRef<TextInput>(null);
  const cell = (width - 64 - 6 * (CODE - 1)) / CODE;

  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  const verify = async (c: string) => {
    setBusy(true);
    const { data, error } = await supabase.auth.verifyOtp({ email, token: c, type: 'email' });
    if (error || !data.user) {
      setBusy(false);
      setWrong(true);
      return;
    }
    const { data: p } = await supabase.from('profiles').select('username').eq('id', data.user.id).maybeSingle();
    setBusy(false);
    if (!p?.username) return router.replace('/profile-setup'); // A6 — только новые пользователи
    await markOnboarded();
    leaveAuth();
  };

  const change = (t: string) => {
    const c = t.replace(/\D/g, '').slice(0, CODE);
    setCode(c);
    setWrong(false);
    if (c.length === CODE) verify(c); // автопроверка после всех цифр
  };

  return (
    <View style={styles.dark}>
      <StatusBar style="light" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={{ flex: 1, paddingTop: insets.top + 9, paddingHorizontal: 32 }}>
          <Pressable onPress={onBack} style={[styles.backBtn, { marginLeft: -16 }]} accessibilityLabel="Назад">
            <Icon name="back" size={20} color={D.paper} />
          </Pressable>
          <Text style={styles.a5Title}>Введите код</Text>
          <Text style={styles.a5Sub}>
            Отправили {CODE} цифр на {email}
          </Text>
          <Pressable onPress={() => input.current?.focus()} style={styles.cells}>
            {Array.from({ length: CODE }, (_, i) => {
              const active = !busy && i === code.length;
              return (
                <View key={i} style={[styles.cell, { width: cell }, (active || wrong) && styles.cellOn]}>
                  {code[i] ? <Text style={styles.cellText}>{code[i]}</Text> : active ? <View style={styles.caret} /> : null}
                </View>
              );
            })}
          </Pressable>
          <TextInput
            ref={input}
            value={code}
            onChangeText={change}
            autoFocus
            keyboardType="number-pad"
            keyboardAppearance="dark"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={CODE}
            style={styles.hidden}
          />
          {wrong ? <Text style={styles.wrong}>Код не подошёл. Проверьте его или запросите новый.</Text> : null}
          {left > 0 ? (
            <Text style={styles.resend}>Отправить ещё раз через 0:{String(left).padStart(2, '0')}</Text>
          ) : (
            <Pressable
              hitSlop={10}
              onPress={async () => {
                await onResend();
                setCode('');
                setWrong(false);
                setLeft(RESEND);
              }}
            >
              <Text style={[styles.resend, { color: D.sun }]}>Отправить ещё раз</Text>
            </Pressable>
          )}
          <View style={{ flex: 1 }} />
          <Pressable
            onPress={() => code.length === CODE && verify(code)}
            disabled={busy || code.length < CODE}
            style={[styles.button, { marginBottom: 16 }, code.length < CODE && { backgroundColor: 'rgba(255,90,54,0.35)' }]}
          >
            {busy ? <ActivityIndicator color={D.white} /> : <Text style={styles.buttonText}>Войти</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  dark: { flex: 1, backgroundColor: D.night },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  placeTag: {
    position: 'absolute',
    left: 0,
    top: 0,
    transformOrigin: 'left top',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 10,
    paddingRight: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: D.sun,
  },
  placeTagText: { fontFamily: F.sansSemi, fontSize: 12, color: D.white },
  brand: { fontFamily: F.serifItalic, fontSize: 22, lineHeight: 29, color: D.sun },
  a4Title: { marginTop: 3, fontFamily: F.serif, fontSize: 33, lineHeight: 39, color: D.paper },
  a4Body: { marginTop: 12, maxWidth: 320, fontFamily: F.sans, fontSize: 16, lineHeight: 23, color: 'rgba(244,239,230,0.6)' },
  field: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(244,239,230,0.14)',
    backgroundColor: 'rgba(244,239,230,0.07)',
  },
  input: { flex: 1, height: '100%', fontFamily: F.sans, fontSize: 16, color: D.paper, padding: 0 },
  error: { marginTop: 8, fontFamily: F.sans, fontSize: 13, color: D.sun },
  button: { backgroundColor: D.sun, borderRadius: 999, paddingVertical: 17, alignItems: 'center' },
  buttonText: { fontFamily: F.sansSemi, fontSize: 16, lineHeight: 20, color: D.white },
  guest: { fontFamily: F.sansSemi, fontSize: 15, color: 'rgba(244,239,230,0.7)' },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(244,239,230,0.1)', alignItems: 'center', justifyContent: 'center' },
  a5Title: { marginTop: 24, fontFamily: F.serif, fontSize: 36, lineHeight: 48, color: D.paper },
  a5Sub: { marginTop: 6, maxWidth: 300, fontFamily: F.sans, fontSize: 16, lineHeight: 23, color: 'rgba(244,239,230,0.6)' },
  cells: { marginTop: 22, flexDirection: 'row', gap: 6 },
  cell: { height: 60, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(244,239,230,0.14)', backgroundColor: 'rgba(244,239,230,0.07)', alignItems: 'center', justifyContent: 'center' },
  cellOn: { borderWidth: 2, borderColor: D.sun },
  cellText: { fontFamily: F.mono, fontSize: 26, color: D.paper },
  caret: { width: 2, height: 26, borderRadius: 1, backgroundColor: D.sun },
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  wrong: { marginTop: 16, fontFamily: F.sans, fontSize: 14, color: D.sun },
  resend: { marginTop: 20, fontFamily: F.sans, fontSize: 14, color: 'rgba(244,239,230,0.5)' },
});
