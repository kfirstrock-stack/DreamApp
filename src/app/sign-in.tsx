import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CircleButton } from '@/components/CircleButton';
import { Icon } from '@/components/Icon';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/lib/theme';

const BG = 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=1200&q=70';

// Вход по коду из письма (макет «Вход»)
export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const { next } = useLocalSearchParams<{ next?: string }>(); // C1 → вход → обратно в C2
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async () => {
    const e = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(e)) return setError('Проверьте адрес почты');
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({ email: e, options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) return setError(error.message);
    setStep('code');
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) return setError('Код не подошёл. Проверьте его или запросите новый.');
    if (next === 'new') router.replace('/new');
    else router.back();
  };

  return (
    <View style={styles.root}>
      <Image source={{ uri: BG }} style={StyleSheet.absoluteFill} contentFit="cover" />
      <View style={[StyleSheet.absoluteFill, styles.shade]} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.closeRow, { paddingTop: insets.top + 8 }]}>
          <CircleButton icon="close" size={42} variant="ghost" onPress={() => router.back()} accessibilityLabel="Закрыть" />
        </View>

        <View style={styles.brand}>
          <Icon name="logo" size={72} color={colors.orange} />
          <Text style={styles.title}>DreamApp</Text>
          <Text style={styles.tagline}>Живая история мест в фотографиях</Text>
        </View>

        <View style={[styles.form, { paddingBottom: insets.bottom + 24 }]}>
          {step === 'email' ? (
            <>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Почта"
                placeholderTextColor={colors.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                style={styles.input}
                onSubmitEditing={sendCode}
              />
              <Pressable style={styles.primary} onPress={sendCode} disabled={busy}>
                {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryText}>Получить код</Text>}
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.note}>Мы отправили код на {email.trim()}</Text>
              <TextInput
                value={code}
                onChangeText={(t) => setCode(t.replace(/\D/g, ''))}
                placeholder="Код из письма"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                maxLength={10}
                style={[styles.input, styles.codeInput]}
                onSubmitEditing={verify}
              />
              <Pressable style={styles.primary} onPress={verify} disabled={busy || code.length < 6}>
                {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryText}>Войти</Text>}
              </Pressable>
              <Pressable onPress={() => setStep('email')} style={styles.secondary}>
                <Text style={styles.secondaryText}>Другая почта</Text>
              </Pressable>
            </>
          )}
          {error && <Text style={styles.error}>{error}</Text>}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.dark },
  shade: { backgroundColor: 'rgba(0,0,0,0.45)' },
  closeRow: { alignItems: 'flex-end', paddingHorizontal: 14 },
  brand: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  title: { color: colors.white, fontSize: 32, fontWeight: '800', marginTop: 8 },
  tagline: { color: 'rgba(255,255,255,0.85)', fontSize: 15 },
  form: { paddingHorizontal: 24, gap: 12 },
  input: {
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    fontSize: 16,
    color: colors.text,
  },
  codeInput: { letterSpacing: 6, fontSize: 20, textAlign: 'center' },
  primary: {
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.white,
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  secondary: { alignItems: 'center', paddingVertical: 8 },
  secondaryText: { color: colors.white, fontSize: 14 },
  note: { color: colors.white, fontSize: 14, textAlign: 'center' },
  error: { color: '#FFB4AE', fontSize: 14, textAlign: 'center' },
});
