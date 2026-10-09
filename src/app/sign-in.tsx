// A4 · Вход по почте и A5 · Ввод кода (8 цифр, Supabase OTP). Новый пользователь → A6, иначе — назад
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { D, F } from '@/lib/design';
import { markOnboarded } from '@/lib/onboarding';
import { supabase } from '@/lib/supabase';

const CODE = 8;
const RESEND = 60;
const ART = {
  left: require('../../assets/onboarding/a4-left.png'),
  right: require('../../assets/onboarding/a4-right.png'),
  center: require('../../assets/onboarding/a4-center.png'),
};

export default function SignIn() {
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
  return <EmailStep email={email} setEmail={setEmail} busy={busy} error={error} onSend={send} />;
}

/** A4 */
function EmailStep({ email, setEmail, busy, error, onSend }: { email: string; setEmail: (s: string) => void; busy: boolean; error: string | null; onSend: () => void }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const s = Math.min(width / 393, height / 852);
  const dx = (width - 393 * s) / 2;
  const at = (x: number, y: number, w: number, h: number) => ({ position: 'absolute' as const, left: dx + x * s, top: insets.top + (y - 47) * s, width: w * s, height: h * s });
  const guest = async () => {
    await markOnboarded();
    router.back();
  };
  return (
    <View style={styles.dark}>
      <StatusBar style="light" />
      <Image source={ART.left} style={at(-1.68, 53.65, 276.33, 322.67)} contentFit="contain" />
      <Image source={ART.right} style={at(178.9, 112.7, 225.67, 285.33)} contentFit="contain" />
      <Image source={ART.center} style={at(65.1, 68.2, 274.67, 324.67)} contentFit="contain" />
      <View style={[at(176, 350, 0, 0), { overflow: 'visible' }]}>
        <View style={[styles.placeTag, { transform: [{ scale: s }] }]}>
          <Icon name="pin" size={14} color={D.white} />
          <Text style={styles.placeTagText}>Исаакиевская пл.</Text>
        </View>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.bottom} keyboardVerticalOffset={-insets.bottom + 16}>
        <View style={{ paddingHorizontal: 32, paddingBottom: Math.max(insets.bottom - 3, 12) }}>
          <Text style={styles.brand}>DreamApp</Text>
          <Text style={styles.a4Title}>Каждое место помнит всех, кто там был</Text>
          <Text style={styles.a4Body}>Выкладывайте снимки с местом и временем — и находите себя на чужих фото.</Text>
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
          <Pressable onPress={onSend} disabled={busy} style={({ pressed }) => [styles.button, { marginTop: 12 }, pressed && { opacity: 0.88 }]}>
            {busy ? <ActivityIndicator color={D.white} /> : <Text style={styles.buttonText}>Получить код</Text>}
          </Pressable>
          {/* G1 · гостевой вход (утверждено 09.10); «Продолжить с Apple» — в сборке для App Store */}
          <Pressable onPress={guest} hitSlop={10} style={{ alignSelf: 'center', marginTop: 20 }}>
            <Text style={styles.guest}>Смотреть карту без входа</Text>
          </Pressable>
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
    router.back();
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
