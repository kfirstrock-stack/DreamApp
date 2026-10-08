import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/components/Avatar';
import { CircleButton } from '@/components/CircleButton';
import { fetchPhoto, photoUrl } from '@/lib/photos';
import { colors, radius, shadow } from '@/lib/theme';
import { dateTime } from '@/lib/time';
import type { Photo } from '@/lib/types';

// «Стопка» — все фото из одной точки карты, вертикальной лентой
export default function StackScreen() {
  const { ids } = useLocalSearchParams<{ ids: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [photos, setPhotos] = useState<Photo[]>([]);

  useEffect(() => {
    const list = (ids ?? '').split(',').filter(Boolean);
    Promise.all(list.map((id) => fetchPhoto(id).catch(() => null))).then((res) =>
      setPhotos(
        (res.filter(Boolean) as Photo[]).sort((a, b) => +new Date(a.taken_at) - +new Date(b.taken_at)),
      ),
    );
  }, [ids]);

  const cardW = width - 28;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <CircleButton icon="back" size={42} onPress={() => router.back()} accessibilityLabel="Назад" />
        <Text style={styles.title}>{photos.length} фото в этом месте</Text>
      </View>
      <FlatList
        data={photos}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 14, gap: 16, paddingBottom: insets.bottom + 24 }}
        renderItem={({ item: p }) => {
          const ratio = p.width && p.height ? p.height / p.width : 1.25;
          return (
            <Pressable onPress={() => router.push({ pathname: '/photo/[id]', params: { id: p.id } })} style={styles.card}>
              <Image
                source={{ uri: photoUrl(p.storage_path) }}
                style={{ width: cardW, height: Math.min(cardW * ratio, cardW * 1.4) }}
                contentFit="cover"
                transition={150}
              />
              <View style={styles.meta}>
                <Avatar name={p.author_name ?? p.author_username} url={p.author_avatar} size={32} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.author}>{p.author_name || p.author_username || 'Путешественник'}</Text>
                  <Text style={styles.time}>{dateTime(new Date(p.taken_at))}</Text>
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingBottom: 8 },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  card: { backgroundColor: colors.white, borderRadius: radius.md, overflow: 'hidden', ...shadow },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  author: { fontSize: 14, fontWeight: '700', color: colors.text },
  time: { fontSize: 12, color: colors.muted, marginTop: 2 },
});
