// Лента · карточки (B5 / D3 / D1, утверждено 13.10): снимок во всю ширину, под ним автор, время, лайки и подпись
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Icon } from '@/components/Icon';
import { useAuth } from '@/lib/auth';
import { D, F } from '@/lib/design';
import { ago } from '@/lib/feed';
import { photoSource, setLike } from '@/lib/photos';
import type { Photo } from '@/lib/types';

const pad = (n: number) => String(n).padStart(2, '0');

export function PhotoCards({ photos, onOpen, showAuthor = true, inset = 20 }: { photos: Photo[]; onOpen: (p: Photo) => void; showAuthor?: boolean; inset?: number }) {
  return (
    <View style={[styles.list, { paddingHorizontal: inset }]}>
      {photos.map((p) => (
        <Card key={p.id} p={p} onOpen={onOpen} showAuthor={showAuthor} inset={inset} />
      ))}
    </View>
  );
}

function Card({ p, onOpen, showAuthor, inset }: { p: Photo; onOpen: (p: Photo) => void; showAuthor: boolean; inset: number }) {
  const { width } = useWindowDimensions();
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const [liked, setLiked] = useState(!!p.liked_by_me);
  const [count, setCount] = useState(p.like_count ?? 0);
  useEffect(() => {
    setLiked(!!p.liked_by_me);
    setCount(p.like_count ?? 0);
  }, [p.liked_by_me, p.like_count]);
  const w = width - inset * 2;
  const ratio = p.width && p.height ? p.height / p.width : 420 / 353; // как в макете, если размеров нет
  const h = Math.round(w * Math.min(1.25, Math.max(0.75, ratio)));
  const t = new Date(p.taken_at);
  const mine = uid === p.user_id;

  const like = async () => {
    if (!uid) return router.push('/sign-in');
    const on = !liked;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setLiked(on);
    setCount((c) => Math.max(0, c + (on ? 1 : -1)));
    try {
      await setLike(p.id, uid, on);
      p.liked_by_me = on; // общий кэш снимка — чтобы кадр во весь экран показал то же
      p.like_count = Math.max(0, (p.like_count ?? 0) + (on ? 1 : -1));
    } catch {
      setLiked(!on);
      setCount((c) => Math.max(0, c + (on ? -1 : 1)));
    }
  };

  return (
    <View style={styles.card}>
      <Pressable onPress={() => onOpen(p)} accessibilityRole="imagebutton" accessibilityLabel={`Снимок ${pad(t.getHours())}:${pad(t.getMinutes())}, открыть`}>
        <Image source={photoSource(p.storage_path)} style={[styles.photo, { height: h }]} contentFit="cover" transition={200} recyclingKey={p.id} />
      </Pressable>
      <View style={styles.row}>
        <Pressable
          onPress={() => (showAuthor ? router.push(mine ? '/profile' : { pathname: '/user/[id]', params: { id: p.user_id } }) : onOpen(p))}
          style={styles.author}
          hitSlop={{ top: 6, bottom: 6 }} // зона нажатия ≥ 44 pt
          accessibilityLabel={showAuthor ? 'Профиль автора' : 'Открыть снимок'}
        >
          {p.author_avatar ? <Image source={{ uri: p.author_avatar }} style={styles.ava} /> : <View style={[styles.ava, { backgroundColor: D.sun }]} />}
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={styles.name} numberOfLines={1}>
              {p.author_name || p.author_username || 'Путешественник'}
            </Text>
            <Text style={styles.sub} numberOfLines={1}>
              снял в {pad(t.getHours())}:{pad(t.getMinutes())} · {ago(t)}
            </Text>
          </View>
        </Pressable>
        <Pressable onPress={like} hitSlop={10} style={styles.like} accessibilityLabel={liked ? 'Убрать лайк' : 'Лайк'}>
          <Icon name={liked ? 'heartFill' : 'heart'} size={20} color={liked ? D.sun : D.ink} />
          <Text style={styles.count}>{count}</Text>
        </Pressable>
      </View>
      {p.caption ? <Text style={styles.caption}>{p.caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 28 },
  card: { gap: 12 },
  photo: { width: '100%', borderRadius: 20, backgroundColor: D.paper2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  author: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  ava: { width: 32, height: 32, borderRadius: 16 },
  name: { fontFamily: F.sansSemi, fontSize: 14, color: D.ink },
  sub: { fontFamily: F.sans, fontSize: 12, color: D.ink60 },
  like: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 8 },
  count: { fontFamily: F.sansMedium, fontSize: 14, color: D.ink },
  caption: { fontFamily: F.sans, fontSize: 14, lineHeight: 20, color: D.ink },
});
