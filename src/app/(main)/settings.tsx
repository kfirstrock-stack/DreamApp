// D5 · Настройки (с «Разрешениями» → системные настройки) и D6 · Удаление аккаунта (диалог поверх). «Скрытые авторы» → D9, правила/конфиденциальность → D7/D8
import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import { type ReactNode, useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { RoundButton } from '@/components/ui/RoundButton';
import { Stagger } from '@/components/ui/Stagger';
import { useAuth } from '@/lib/auth';
import { D, F } from '@/lib/design';
import { forgetLastUser } from '@/lib/lastUser';
import { deleteAccount, fetchHiddenAuthors, fetchMatchesEnabled, fetchStats, setMatchesEnabled } from '@/lib/profileData';
import { supabase } from '@/lib/supabase';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const uid = session?.user.id;
  const [matchesOn, setMatchesOn] = useState(true);
  const [hidden, setHidden] = useState<number | null>(null);
  const [photos, setPhotos] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!uid) return;
      fetchMatchesEnabled(uid).then(setMatchesOn).catch(() => {});
      fetchHiddenAuthors(uid).then((l) => setHidden(l.length)).catch(() => {});
      fetchStats(uid).then((s) => setPhotos(s.moments)).catch(() => {});
    }, [uid]),
  );

  const toggle = () => {
    if (!uid) return;
    const next = !matchesOn;
    setMatchesOn(next);
    setMatchesEnabled(uid, next).catch(() => {
      setMatchesOn(!next);
      Alert.alert('Не получилось', 'Проверьте интернет и попробуйте ещё раз.');
    });
  };
  const signOut = async () => {
    await supabase.auth.signOut();
    router.dismissTo('/');
  };
  const remove = async () => {
    if (!uid) return;
    setDeleting(true);
    try {
      await deleteAccount(uid);
      await forgetLastUser();
      setConfirm(false);
      router.dismissTo('/');
    } catch {
      setDeleting(false);
      Alert.alert('Не получилось удалить', 'Проверьте интернет и попробуйте ещё раз.');
    }
  };
  const email = session?.user.email ?? '';
  const version = Constants.expoConfig?.version ?? '1.0';

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 9, paddingBottom: Math.max(insets.bottom, 16) + 12 }}>
        <View style={styles.head}>
          <RoundButton icon="back" label="Назад" onPress={() => router.back()} />
          <Text style={styles.title}>Настройки</Text>
        </View>

        <View style={styles.body}>
          <Stagger i={0}>
          <Text style={styles.label}>АККАУНТ</Text>
          <View style={styles.card}>
            <Row title="Почта" value={email} />
            <Sep />
            <Row title="Профиль" chevron onPress={() => router.push('/profile-edit')} />
          </View>
          </Stagger>

          <Stagger i={1}>
          <Text style={[styles.label, styles.next]}>ПРИВАТНОСТЬ</Text>
          <View style={styles.card}>
            <Row title="Участвовать в совпадениях" onPress={toggle} right={<Toggle on={matchesOn} />} role="switch" checked={matchesOn} />
            <Sep />
            <Row title="Скрытые авторы" value={hidden != null ? String(hidden) : ''} chevron onPress={() => router.push('/hidden')} />
            <Sep />
            {/* 12.10: разрешения меняются только в настройках iPhone — открываем страницу DreamApp там */}
            <Row title="Разрешения" value="Камера, фото, место" chevron onPress={() => Linking.openSettings().catch(() => {})} />
          </View>
          </Stagger>

          <Stagger i={2}>
          <Text style={[styles.label, styles.next]}>О ПРИЛОЖЕНИИ</Text>
          <View style={styles.card}>
            <Row title="Правила сообщества" chevron onPress={() => router.push({ pathname: '/doc/[kind]', params: { kind: 'rules' } })} />
            <Sep />
            <Row title="Конфиденциальность" chevron onPress={() => router.push({ pathname: '/doc/[kind]', params: { kind: 'privacy' } })} />
          </View>
          </Stagger>

          <Stagger i={3}>
          <View style={[styles.card, { marginTop: 28 }]}>
            <Row title="Выйти" onPress={signOut} />
            <Sep />
            <Row title="Удалить аккаунт" danger onPress={() => setConfirm(true)} />
          </View>
          </Stagger>
        </View>
        <View style={{ flex: 1, minHeight: 32 }} />
        <Text style={styles.version}>DreamApp {version} (MVP)</Text>
      </ScrollView>

      {confirm && (
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(160)} style={styles.dim}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => !deleting && setConfirm(false)} />
          <Animated.View entering={ZoomIn.springify().damping(18).stiffness(220)} style={styles.dialog}>
            <View style={styles.ic}>
              <Icon name="alert" size={26} color={D.sun} />
            </View>
            <Text style={styles.dTitle}>Удалить аккаунт?</Text>
            <Text style={styles.dText}>
              {photos > 0 ? `Все ваши ${photos} фото, лайки и совпадения` : 'Ваш профиль, лайки и совпадения'} удалятся без возможности восстановления.
            </Text>
            <Pressable onPress={remove} disabled={deleting} style={({ pressed }) => [styles.dButton, pressed && { opacity: 0.88 }]}>
              {deleting ? <ActivityIndicator color={D.white} /> : <Text style={styles.dButtonText}>Удалить навсегда</Text>}
            </Pressable>
            {/* 32 pt от кнопки и зона нажатия 45 pt, не заходящая на кнопку */}
            <Pressable onPress={() => setConfirm(false)} disabled={deleting} hitSlop={{ left: 16, right: 16 }} style={styles.cancel}>
              <Text style={styles.cancelText}>Отмена</Text>
            </Pressable>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}

function Row({ title, value, chevron, danger, right, onPress, role, checked }: {
  title: string; value?: string; chevron?: boolean; danger?: boolean; right?: ReactNode; onPress?: () => void; role?: 'switch'; checked?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={role ?? (onPress ? 'button' : 'text')}
      accessibilityState={role ? { checked } : undefined}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
    >
      <Text style={[styles.rowTitle, danger && { color: D.sun }]} numberOfLines={1}>
        {title}
      </Text>
      <View style={{ flex: 1 }} />
      {value ? (
        <Text style={styles.rowValue} numberOfLines={1} ellipsizeMode="tail">
          {value}
        </Text>
      ) : null}
      {right}
      {chevron && <Icon name="chevR" size={18} color={D.ink40} />}
    </Pressable>
  );
}

const Sep = () => <View style={styles.sep} />;

function Toggle({ on }: { on: boolean }) {
  return (
    <View style={[styles.toggle, { backgroundColor: on ? D.sun : D.line }]}>
      <View style={[styles.knob, { left: on ? 22 : 2 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: D.paper },
  head: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16 },
  title: { fontFamily: F.serif, fontSize: 30, color: D.ink },
  body: { paddingHorizontal: 24, marginTop: 24 },
  label: { fontFamily: F.mono, fontSize: 11, letterSpacing: 0.66, color: D.ink60, marginBottom: 10 },
  next: { marginTop: 28 },
  card: { backgroundColor: D.white, borderRadius: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 16, paddingRight: 14, paddingVertical: 15, minHeight: 50 },
  rowTitle: { fontFamily: F.sans, fontSize: 16, color: D.ink, flexShrink: 0 },
  rowValue: { flexShrink: 1, maxWidth: 170, fontFamily: F.sans, fontSize: 15, color: D.ink40 },
  sep: { height: 1, marginHorizontal: 8, backgroundColor: D.line },
  toggle: { width: 48, height: 28, borderRadius: 14 },
  knob: { position: 'absolute', top: 2, width: 24, height: 24, borderRadius: 12, backgroundColor: D.white },
  version: { marginLeft: 24, fontFamily: F.monoRegular, fontSize: 11, color: D.ink40 },
  dim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,14,12,0.5)', justifyContent: 'center', paddingHorizontal: 24 },
  dialog: {
    backgroundColor: D.white,
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 30 - 13,
    shadowColor: '#17120D',
    shadowOpacity: 0.3,
    shadowRadius: 25,
    shadowOffset: { width: 0, height: 20 },
  },
  ic: { width: 52, height: 52, borderRadius: 26, backgroundColor: D.sunSoft, alignItems: 'center', justifyContent: 'center' },
  dTitle: { marginTop: 16, fontFamily: F.serif, fontSize: 26, color: D.ink },
  dText: { marginTop: 8, fontFamily: F.sans, fontSize: 15, lineHeight: 22, color: D.ink60 },
  dButton: { marginTop: 18, backgroundColor: D.sun, borderRadius: 999, paddingVertical: 17, alignItems: 'center' },
  dButtonText: { fontFamily: F.sansSemi, fontSize: 16, lineHeight: 20, color: D.white },
  cancel: { alignSelf: 'center', marginTop: 32 - 13, paddingVertical: 13 },
  cancelText: { fontFamily: F.sansSemi, fontSize: 15, color: D.ink60 },
});
