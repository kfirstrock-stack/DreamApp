import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/components/Avatar';
import { CircleButton } from '@/components/CircleButton';
import { Mosaic } from '@/components/Mosaic';
import { useAuth } from '@/lib/auth';
import { fetchUserPhotos } from '@/lib/photos';
import { supabase } from '@/lib/supabase';
import { colors, shadow } from '@/lib/theme';
import type { Photo } from '@/lib/types';

// Личный кабинет: имя, количество фото и все свои снимки мозаикой
export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { session, profile, refreshProfile } = useAuth();
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      fetchUserPhotos(session.user.id).then(setPhotos).catch(() => setPhotos([]));
    }, [session]),
  );

  if (!session) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.name}>Вы не вошли</Text>
        <Pressable style={styles.btn} onPress={() => router.replace('/sign-in')}>
          <Text style={styles.btnText}>Войти</Text>
        </Pressable>
      </View>
    );
  }

  const displayName = profile?.display_name || profile?.username || session.user.email || 'Путешественник';

  const saveName = async () => {
    const v = name.trim().slice(0, 60);
    const { error } = await supabase.from('profiles').update({ display_name: v || null }).eq('id', session.user.id);
    if (error) return Alert.alert('Не сохранилось', error.message);
    await refreshProfile();
    setEditing(false);
  };

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topRow}>
        <CircleButton icon="back" size={42} onPress={() => router.back()} accessibilityLabel="Назад" />
        <CircleButton
          icon="logout"
          size={42}
          onPress={() =>
            Alert.alert('Выйти из аккаунта?', '', [
              { text: 'Отмена', style: 'cancel' },
              { text: 'Выйти', style: 'destructive', onPress: () => supabase.auth.signOut().then(() => router.back()) },
            ])
          }
          accessibilityLabel="Выйти"
        />
      </View>
      <Avatar name={displayName} url={profile?.avatar_url} size={96} />
      {editing ? (
        <View style={styles.editRow}>
          <TextInput value={name} onChangeText={setName} style={styles.input} autoFocus maxLength={60} onSubmitEditing={saveName} />
          <CircleButton icon="check" size={40} variant="teal" onPress={saveName} accessibilityLabel="Сохранить" />
        </View>
      ) : (
        <Pressable
          onPress={() => {
            setName(profile?.display_name ?? '');
            setEditing(true);
          }}
        >
          <Text style={styles.name}>{displayName} ✎</Text>
        </Pressable>
      )}
      <View style={styles.stat}>
        <Text style={styles.statNum}>{photos?.length ?? '–'}</Text>
        <Text style={styles.statLabel}>фото</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      {header}
      {photos === null ? (
        <ActivityIndicator color={colors.teal} style={{ marginTop: 24 }} />
      ) : (
        <Mosaic
          photos={photos}
          onOpen={(p) => router.push({ pathname: '/photo/[id]', params: { id: p.id } })}
          topInset={12}
          bottomInset={insets.bottom + 24}
          empty={
            <View style={{ alignItems: 'center', gap: 10 }}>
              <Text style={styles.emptyText}>У вас пока нет фото</Text>
              <Pressable style={styles.btn} onPress={() => router.push('/add')}>
                <Text style={styles.btnText}>Добавить первое</Text>
              </Pressable>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: 16 },
  header: {
    alignItems: 'center',
    gap: 8,
    paddingBottom: 16,
    backgroundColor: colors.white,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    ...shadow,
    shadowOpacity: 0.08,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch', paddingHorizontal: 14 },
  name: { fontSize: 20, fontWeight: '700', color: colors.text },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24 },
  input: {
    flex: 1,
    height: 42,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 16,
    color: colors.text,
  },
  stat: { alignItems: 'center' },
  statNum: { fontSize: 22, fontWeight: '800', color: colors.teal },
  statLabel: { fontSize: 12, color: colors.muted },
  emptyText: { fontSize: 15, color: colors.muted },
  btn: { backgroundColor: colors.teal, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999 },
  btnText: { color: colors.white, fontWeight: '700', fontSize: 15 },
});
