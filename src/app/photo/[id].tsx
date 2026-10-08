import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/components/Avatar';
import { CircleButton } from '@/components/CircleButton';
import { useAuth } from '@/lib/auth';
import { requestMapFocus } from '@/lib/focus';
import { deletePhoto, fetchPhoto, photoUrl } from '@/lib/photos';
import { colors } from '@/lib/theme';
import { dateTime } from '@/lib/time';
import type { Photo } from '@/lib/types';

// Одиночное фото с панелью информации (макет «Одиночное фото…_информация активна»)
export default function PhotoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [failed, setFailed] = useState(false);
  const [info, setInfo] = useState(true);
  const [fit, setFit] = useState<'cover' | 'contain'>('contain');

  useEffect(() => {
    fetchPhoto(id)
      .then((p) => (p ? setPhoto(p) : setFailed(true)))
      .catch(() => setFailed(true));
  }, [id]);

  if (failed)
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.white}>Фото не найдено</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={[styles.white, { color: colors.tealLight }]}>Назад</Text>
        </Pressable>
      </View>
    );
  if (!photo)
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.white} />
      </View>
    );

  const taken = new Date(photo.taken_at);
  const mine = session?.user.id === photo.user_id;

  const showOnMap = () => {
    requestMapFocus({ lat: photo.lat, lng: photo.lng });
    router.dismissTo('/');
  };
  const whoElse = () => {
    requestMapFocus({ lat: photo.lat, lng: photo.lng, at: taken });
    router.dismissTo('/');
  };
  const remove = () =>
    Alert.alert('Удалить фото?', 'Его больше никто не увидит.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePhoto(photo);
            router.back();
          } catch (e: any) {
            Alert.alert('Не получилось', e?.message ?? '');
          }
        },
      },
    ]);

  return (
    <View style={styles.root}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => setFit((f) => (f === 'cover' ? 'contain' : 'cover'))}>
        <Image source={{ uri: photoUrl(photo.storage_path) }} style={StyleSheet.absoluteFill} contentFit={fit} transition={200} />
      </Pressable>

      <View style={[styles.topRow, { top: insets.top + 8 }]}>
        <CircleButton icon="back" size={42} variant="ghost" onPress={() => router.back()} accessibilityLabel="Назад" />
      </View>

      <View style={[styles.side, { top: insets.top + 8 }]}>
        <CircleButton icon="info" size={44} active={info} onPress={() => setInfo((v) => !v)} accessibilityLabel="Информация" />
        <CircleButton icon="map" size={44} onPress={showOnMap} accessibilityLabel="Показать на карте" />
        <CircleButton icon="people" size={44} onPress={whoElse} accessibilityLabel="Кто ещё был здесь" />
        {mine && <CircleButton icon="trash" size={44} onPress={remove} accessibilityLabel="Удалить" />}
      </View>

      {info && (
        <View style={[styles.panel, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.authorRow}>
            <Avatar name={photo.author_name ?? photo.author_username} url={photo.author_avatar} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={styles.author}>{photo.author_name || photo.author_username || 'Путешественник'}</Text>
              <Text style={styles.sub}>{dateTime(taken)}</Text>
            </View>
          </View>
          {photo.place_name ? <Text style={styles.place}>📍 {photo.place_name}</Text> : null}
          {photo.caption ? <Text style={styles.caption}>{photo.caption}</Text> : null}
          <Pressable onPress={whoElse} style={styles.cta}>
            <Text style={styles.ctaText}>Кто ещё был здесь в это время?</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.dark },
  center: { alignItems: 'center', justifyContent: 'center' },
  white: { color: colors.white, fontSize: 16 },
  topRow: { position: 'absolute', left: 14 },
  side: { position: 'absolute', right: 14, gap: 12 },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingTop: 18,
    backgroundColor: 'rgba(0,0,0,0.62)',
    gap: 8,
  },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  author: { color: colors.white, fontSize: 16, fontWeight: '700' },
  sub: { color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 2 },
  place: { color: colors.white, fontSize: 14 },
  caption: { color: colors.white, fontSize: 15, lineHeight: 21 },
  cta: { marginTop: 6, alignSelf: 'flex-start', backgroundColor: colors.teal, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 },
  ctaText: { color: colors.white, fontWeight: '700', fontSize: 14 },
});
