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
import { forgetLastUser, loadLastUser, type LastShot, type LastUser } from '@/lib/lastUser';
import { photoSource } from '@/lib/photos';
import { leaveAuth, markOnboarded } from '@/lib/onboarding';
import { supabase } from '@/lib/supabase';

const CODE = 8;
// №2 (12.10): опечатка в домене частой почты — подсказываем «Возможно, …@gmail.com?»
const DOMAINS = ['gmail.com', 'mail.ru', 'yandex.ru', 'ya.ru', 'icloud.com', 'bk.ru', 'inbox.ru', 'list.ru', 'rambler.ru', 'outlook.com', 'hotmail.com', 'yahoo.com', 'me.com'];
// настоящие домены, похожие на частые, — им ничего не подсказываем
const KNOWN = ['mail.com', 'gmx.com', 'gmx.de', 'ymail.com', 'yandex.com', 'yandex.by', 'yandex.kz', 'live.com', 'aol.com', 'mac.com', 'proton.me', 'protonmail.com', 'internet.ru'];
const lev = (a: string, b: string) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};
function suggestEmail(raw: string): string | null {
  const m = raw.trim().toLowerCase().match(/^([^@\s]+)@([^@\s]+)$/);
  if (!m || DOMAINS.includes(m[2]) || KNOWN.includes(m[2])) return null;
  let best: string | null = null, bd = 3;
  for (const k of DOMAINS) {
    const x = lev(m[2], k);
    if (x < bd) (bd = x), (best = k);
  }
  return best && bd <= 2 ? `${m[1]}@${best}` : null;
}
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
  // уже входили на этом телефоне и вышли — A4 «С возвращением»
  const [returning, setReturning] = useState<LastUser | null>(null);
  const [known, setKnown] = useState(false); // пока не прочитали — тёмный фон, без мелькания обычного A4
  useEffect(() => {
    loadLastUser().then((u) => {
      if (u) {
        setReturning(u);
        setEmail(u.email);
      }
      setKnown(true);
    });
  }, []);
  const otherEmail = () => {
    forgetLastUser();
    setReturning(null);
    setEmail('');
    setError(null);
  };

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

  if (!known) return <View style={styles.dark} />;
  if (step === 'code') return <CodeStep email={email.trim().toLowerCase()} onBack={() => setStep('email')} onResend={send} />;
  return (
    <EmailStep
      email={email}
      setEmail={(v) => {
        setEmail(v);
        setError(null); // подсказка об ошибке уходит, как только адрес правят
      }}
      busy={busy}
      error={error}
      onSend={send}
      enter={enter}
      returning={returning}
      onOtherEmail={otherEmail}
    />
  );
}

// A4 «С возвращением» · свои снимки (утверждено 13.10): полароид как в макете — рамка 8, подпись «11 ОКТ 2026 · 00:13».
// Центр, наклон и размеры — из макета (115:12/15/18); box — рамка картинки из макета, внутри которой он стоит.
const MON_CAP = ['ЯНВ', 'ФЕВ', 'МАР', 'АПР', 'МАЙ', 'ИЮН', 'ИЮЛ', 'АВГ', 'СЕН', 'ОКТ', 'НОЯ', 'ДЕК'];
const pad2 = (n: number) => String(n).padStart(2, '0');
const shotCaption = (iso: string) => {
  const d = new Date(iso);
  return `${pad2(d.getDate())} ${MON_CAP[d.getMonth()]} ${d.getFullYear()} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};
type Slot = { box: [number, number]; c: [number, number]; w: number; h: number; rot: number };
const SLOTS: Record<'center' | 'left' | 'right', Slot> = {
  center: { box: [65.1, 56.2], c: [202.44, 204.5], w: 206, h: 258, rot: 2 },
  left: { box: [-1.68, 41.65], c: [136.47, 188.99], w: 186, h: 238, rot: -9 },
  right: { box: [178.9, 100.7], c: [291.7, 229.3], w: 166, h: 208, rot: 7 },
};
function Polaroid({ shot, slot, s }: { shot: LastShot; slot: Slot; s: number }) {
  return (
    <View
      style={[
        styles.polaroid,
        {
          left: (slot.c[0] - slot.w / 2 - slot.box[0]) * s,
          top: (slot.c[1] - slot.h / 2 - slot.box[1]) * s,
          width: slot.w * s,
          height: slot.h * s,
          padding: 8 * s,
          borderRadius: 6 * s,
          shadowRadius: 15 * s,
          shadowOffset: { width: 0, height: 14 * s },
          transform: [{ rotate: `${slot.rot}deg` }],
        },
      ]}
    >
      <Image source={photoSource(shot.path)} style={{ width: '100%', height: (slot.h - 38) * s, borderRadius: 2 * s, backgroundColor: D.paper2 }} contentFit="cover" />
      <Text style={[styles.polaroidCap, { marginTop: 8 * s, fontSize: 9 * s, letterSpacing: 0.36 * s }]} numberOfLines={1}>
        {shotCaption(shot.taken_at)}
      </Text>
    </View>
  );
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

function EmailStep({ email, setEmail, busy, error, onSend, enter, returning, onOtherEmail }: {
  email: string; setEmail: (s: string) => void; busy: boolean; error: string | null; onSend: () => void; enter: SharedValue<number>;
  returning: LastUser | null; onOtherEmail: () => void;
}) {
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
  // что из текста помещается над полем при открытой клавиатуре: 1 — оставить, 0 — убрать
  const keepTitle = useSharedValue(1);
  const keepBody = useSharedValue(1);
  const titleH = useSharedValue(0);
  const bodyH = useSharedValue(0);
  const lowerH = useRef(0);
  const kbH = useRef(0);
  // что из текста помещается над полем при открытой клавиатуре (заголовок важнее подписи)
  const fitText = (duration = 250) => {
    const t = { duration, easing: Easing.out(Easing.cubic) };
    // место над полем: от статус-бара до верха поля (поле, кнопка и ссылка стоят на клавиатуре)
    const avail = height - kbH.current - lowerH.current - insets.top - 16 - 32; // 32 — «DreamApp»
    const tH = titleH.value;
    const bH = bodyH.value;
    const title = tH + bH <= avail || tH <= avail;
    const body = tH + bH <= avail || (!title && bH <= avail);
    keepTitle.value = withTiming(title ? 1 : 0, t);
    keepBody.value = withTiming(body ? 1 : 0, t);
  };
  // 12.10 (№7): текст сменился при открытой клавиатуре — пересчитать, иначе он обрезался по старым размерам
  const measured = (which: 'title' | 'body', h: number) => {
    (which === 'title' ? titleH : bodyH).value = h;
    if (kbOpen.current) fitText(150);
  };
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      kbOpen.current = true;
      kbH.current = e.endCoordinates.height;
      fitText(e.duration || 250);
      kb.value = withTiming(1, { duration: e.duration || 250, easing: Easing.out(Easing.cubic) });
    });
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', (e) => {
      kbOpen.current = false;
      const t = { duration: e.duration || 250, easing: Easing.out(Easing.cubic) };
      keepTitle.value = withTiming(1, t);
      keepBody.value = withTiming(1, t);
      kb.value = withTiming(0, t);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [kb, keepTitle, keepBody, titleH, bodyH, height, insets.top]);
  const artKb = useAnimatedStyle(() => ({
    opacity: 1 - kb.value,
    transform: [{ translateY: -40 * kb.value }, { scale: 1 - 0.06 * kb.value }],
  }));
  const titleKb = useAnimatedStyle(() =>
    titleH.value > 0 ? { height: titleH.value * keepTitle.value, opacity: interpolate(keepTitle.value, [0.5, 1], [0, 1], Extrapolation.CLAMP) } : {},
  );
  const bodyKb = useAnimatedStyle(() =>
    bodyH.value > 0 ? { height: bodyH.value * keepBody.value, opacity: interpolate(keepBody.value, [0.5, 1], [0, 1], Extrapolation.CLAMP) } : {},
  );
  // на невысоких экранах полароиды уменьшаются, чтобы до «DreamApp» оставались 32 pt, как в макете
  const [textTop, setTextTop] = useState<number | null>(null);
  const fit = textTop == null ? 1 : (textTop - 32 - insets.top) / (362 - 47);
  const s = Math.min(width / 393, height / 852, fit);
  const dx = (width - 393 * s) / 2;
  const at = (x: number, y: number, w: number, h: number) => ({ position: 'absolute' as const, left: dx + x * s, top: insets.top + (y - 47) * s, width: w * s, height: h * s });
  const shots = returning?.shots ?? [];
  const titleText = returning ? `С возвращением, ${returning.name}` : 'Каждое место помнит всех, кто там был';
  const bodyText = returning
    ? Platform.OS === 'ios'
      ? 'Пришлём код на почту — iOS подставит его из письма сама.'
      : 'Пришлём код на почту — останется только ввести его.'
    : 'Выкладывайте снимки с местом и временем — и находите себя на чужих фото.';
  const guest = async () => {
    await markOnboarded();
    leaveAuth();
  };
  return (
    <View style={styles.dark}>
      <StatusBar style="light" />
      {/* №8 (12.10): тап по пустому месту — убрать клавиатуру */}
      <Pressable style={StyleSheet.absoluteFill} onPress={Keyboard.dismiss} accessible={false} />
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, artKb]}>
      {/* свои снимки встают по порядку: центр → слева → справа; пустые места — картинки из макета */}
      <Animated.View style={[at(-1.68, 41.65, 276.33, 322.67), eLeft]}>
        {shots[1] ? <Polaroid shot={shots[1]} slot={SLOTS.left} s={s} /> : <Image source={ART.left} style={StyleSheet.absoluteFill} contentFit="contain" />}
      </Animated.View>
      <Animated.View style={[at(178.9, 100.7, 225.67, 285.33), eRight]}>
        {shots[2] ? <Polaroid shot={shots[2]} slot={SLOTS.right} s={s} /> : <Image source={ART.right} style={StyleSheet.absoluteFill} contentFit="contain" />}
      </Animated.View>
      <Animated.View style={[at(65.1, 56.2, 274.67, 324.67), eCenter]}>
        {shots[0] ? <Polaroid shot={shots[0]} slot={SLOTS.center} s={s} /> : <Image source={ART.center} style={StyleSheet.absoluteFill} contentFit="contain" />}
      </Animated.View>
      {shots[0] ? (
        // ярлык — место центрального снимка, по центру под ним; нет названия места — ярлыка нет
        shots[0].place ? (
          <Animated.View style={[at(249 - 180, 338, 360, 27), { alignItems: 'center' }, eTag]}>
            <View style={[styles.placeTagReal, { transform: [{ scale: s }] }]}>
              <Icon name="pin" size={14} color={D.white} />
              <Text style={styles.placeTagText} numberOfLines={1}>
                {shots[0].place}
              </Text>
            </View>
          </Animated.View>
        ) : null
      ) : (
        <Animated.View style={[at(176, 338, 0, 0), { overflow: 'visible' }, eTag]}>
          <View style={[styles.placeTag, { transform: [{ scale: s }] }]}>
            <Icon name="pin" size={14} color={D.white} />
            <Text style={styles.placeTagText}>Исаакиевская пл.</Text>
          </View>
        </Animated.View>
      )}
      </Animated.View>
      <View pointerEvents="none" style={{ position: 'absolute', left: 32, top: 0, width: width - 64, opacity: 0 }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Text key={titleText} style={styles.a4Title} onLayout={(e) => measured('title', e.nativeEvent.layout.height + 3)}>{titleText}</Text>
        <Text key={bodyText} style={styles.a4Body} onLayout={(e) => measured('body', e.nativeEvent.layout.height + 12)}>{bodyText}</Text>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.bottom} keyboardVerticalOffset={-insets.bottom + 16}>
        <View onLayout={(e) => !kbOpen.current && setTextTop(height - e.nativeEvent.layout.height)} style={{ paddingHorizontal: 32, paddingBottom: Math.max(insets.bottom - 3 - 13, 0) }}>
          <Animated.Text style={[styles.brand, t1]}>DreamApp</Animated.Text>
          {/* №7: видимый текст пересоздаётся при смене (key), а высоты меряют невидимые копии вне обрезки —
              иначе iOS оставлял старую раскладку и строки резались и справа, и снизу */}
          <Animated.View style={[{ overflow: 'hidden' }, titleKb]}>
            <Animated.Text key={titleText} style={[styles.a4Title, t2]}>{titleText}</Animated.Text>
          </Animated.View>
          <Animated.View style={[{ overflow: 'hidden' }, bodyKb]}>
            <Animated.Text key={bodyText} style={[styles.a4Body, t3]}>{bodyText}</Animated.Text>
          </Animated.View>
          <View onLayout={(e) => (lowerH.current = e.nativeEvent.layout.height)}>
          <Animated.View style={t4}>
          {returning ? (
            // почта прошлого входа — не редактируется; сменить — «Другая почта»
            <View style={styles.field}>
              {returning.avatar ? (
                <Image source={{ uri: returning.avatar }} style={styles.acctAva} />
              ) : (
                <View style={[styles.acctAva, styles.acctIni]}>
                  <Text style={styles.acctIniText}>{returning.name.slice(0, 1).toUpperCase()}</Text>
                </View>
              )}
              <Text style={styles.acctEmail} numberOfLines={1}>
                {returning.email}
              </Text>
            </View>
          ) : (
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
            {/* №1 (12.10): крестик очистки — только когда в поле что-то есть */}
            {email.length > 0 && (
              <Pressable onPress={() => setEmail('')} hitSlop={12} accessibilityLabel="Очистить почту">
                <Icon name="close" size={20} color="rgba(244,239,230,0.6)" />
              </Pressable>
            )}
          </View>
          )}
          {error ? (
            <Text style={styles.error}>{error}</Text>
          ) : !returning && suggestEmail(email) ? (
            <Pressable onPress={() => setEmail(suggestEmail(email)!)} hitSlop={8} accessibilityLabel={`Исправить на ${suggestEmail(email)}`}>
              <Text style={styles.suggest}>
                Возможно, <Text style={styles.suggestAddr}>{suggestEmail(email)}</Text>?
              </Text>
            </Pressable>
          ) : null}
          </Animated.View>
          <Animated.View style={t5}>
            <Pressable onPress={onSend} disabled={busy} style={({ pressed }) => [styles.button, { marginTop: 12 }, pressed && { opacity: 0.88 }]}>
              {busy ? (
                <ActivityIndicator color={D.white} />
              ) : (
                <Text style={styles.buttonText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                  {returning ? `Войти как ${returning.name}` : 'Получить код'}
                </Text>
              )}
            </Pressable>
            {/* G1 · гостевой вход (утверждено 09.10); «Продолжить с Apple» — в сборке для App Store */}
            {/* 32 pt от кнопки до ссылки и зона нажатия 45 pt, которая не заходит на кнопку — чтобы не промахнуться */}
            {returning ? (
              <View style={styles.links}>
                <Pressable onPress={onOtherEmail} hitSlop={{ left: 12, right: 12 }} style={styles.linkHit}>
                  <Text style={styles.guest}>Другая почта</Text>
                </Pressable>
                <Text style={[styles.guest, { opacity: 0.5 }]}>·</Text>
                <Pressable onPress={guest} hitSlop={{ left: 12, right: 12 }} style={styles.linkHit}>
                  <Text style={styles.guest}>Без входа</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={guest} hitSlop={{ left: 16, right: 16 }} style={{ alignSelf: 'center', marginTop: 32 - 13, paddingVertical: 13 }}>
                <Text style={styles.guest}>Смотреть карту без входа</Text>
              </Pressable>
            )}
          </Animated.View>
          </View>
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
  placeTagReal: {
    transformOrigin: 'center top',
    maxWidth: 300,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 10,
    paddingRight: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: D.sun,
  },
  polaroid: {
    position: 'absolute',
    backgroundColor: D.paper,
    shadowColor: '#17120D',
    shadowOpacity: 0.45,
    elevation: 12,
  },
  polaroidCap: { fontFamily: F.monoRegular, color: D.ink60 },
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
  suggest: { marginTop: 10, marginLeft: 4, fontFamily: F.sans, fontSize: 14, color: 'rgba(244,239,230,0.7)' },
  suggestAddr: { fontFamily: F.sansSemi, color: D.sun },
  button: { backgroundColor: D.sun, borderRadius: 999, paddingVertical: 17, alignItems: 'center' },
  buttonText: { fontFamily: F.sansSemi, fontSize: 16, lineHeight: 20, color: D.white },
  guest: { fontFamily: F.sansSemi, fontSize: 15, color: 'rgba(244,239,230,0.7)' },
  // A4 · с возвращением
  acctAva: { width: 32, height: 32, borderRadius: 16, backgroundColor: D.night3, marginLeft: -4 },
  acctIni: { backgroundColor: D.sun, alignItems: 'center', justifyContent: 'center' },
  acctIniText: { fontFamily: F.sansSemi, fontSize: 14, color: D.white },
  acctEmail: { flex: 1, fontFamily: F.sans, fontSize: 16, color: D.paper },
  links: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28, marginTop: 32 - 13 },
  linkHit: { paddingVertical: 13 },
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
