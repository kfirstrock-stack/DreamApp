import { router } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/components/Icon';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

// Боковое меню (в первой версии — простая шторка снизу)
export default function MenuScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();

  const items: { icon: IconName; label: string; onPress: () => void }[] = [
    session
      ? { icon: 'person', label: 'Мой профиль', onPress: () => router.replace('/profile') }
      : { icon: 'mail', label: 'Войти', onPress: () => router.replace('/sign-in') },
    { icon: 'clock', label: 'Прототип: шкала времени', onPress: () => router.replace('/proto') },
    { icon: 'camera', label: 'Добавить фото', onPress: () => router.replace(session ? '/add' : '/sign-in') },
    {
      icon: 'info',
      label: 'О DreamApp',
      onPress: () =>
        Alert.alert(
          'DreamApp',
          'Живая история мест в фотографиях. Выкладывайте снимки с местом и временем — и, возможно, найдёте себя на чужих фото.',
        ),
    },
  ];
  if (session)
    items.push({
      icon: 'logout',
      label: 'Выйти',
      onPress: () => supabase.auth.signOut().then(() => router.back()),
    });

  return (
    <Pressable style={styles.backdrop} onPress={() => router.back()}>
      <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} onPress={() => {}}>
        <View style={styles.handle} />
        {items.map((it) => (
          <Pressable key={it.label} onPress={it.onPress} style={({ pressed }) => [styles.item, pressed && { backgroundColor: colors.bg }]}>
            <Icon name={it.icon} size={22} color={colors.teal} />
            <Text style={styles.label}>{it.label}</Text>
          </Pressable>
        ))}
        {session?.user.email ? <Text style={styles.email}>{session.user.email}</Text> : null}
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 10, paddingHorizontal: 12 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 12 },
  label: { fontSize: 16, color: colors.text, fontWeight: '500' },
  email: { textAlign: 'center', color: colors.muted, fontSize: 12, marginTop: 8 },
});
