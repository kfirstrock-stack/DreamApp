// Лента · карточки (B5 / D3 / D1, утверждено 13.10): снимок во всю ширину, под ним автор, время, лайки и подпись.
// В профиле (showAuthor = false) автор всегда один — вместо него место снимка: тап → карта у этого места и времени (17.11)
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from '@/components/ui/Text';
import { Icon } from '@/components/Icon';
import { useAuth } from '@/lib/auth';
import { D, F } from '@/lib/design';
import { ago } from '@/lib/feed';
import { hasPlace, useShowPhotoOnMap } from '@/lib/focus';
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
        {!showAuthor ? (
          <PlaceTag p={p} t={t} />
        ) : (
        <Pressable
          onPress={() => router.push(mine ? '/profile' : { pathname: '/user/[id]', params: { id: p.user_id } })}
          style={styles.author}
          hitSlop={{ top: 6, bottom: 6 }} // зона нажатия ≥ 44 pt
          accessibilityLabel="Профиль автора"
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
        )}
        <Pressable onPress={like} hitSlop={10} style={styles.like} accessibilityLabel={liked ? 'Убрать лайк' : 'Лайк'}>
          <Icon name={liked ? 'heartFill' : 'heart'} size={20} color={liked ? D.sun : D.ink} />
          <Text style={styles.count}>{count}</Text>
        </Pressable>
      </View>
      {p.caption ? <Text style={styles.caption}>{p.caption}</Text> : null}
    </View>
  );
}

/** Место снимка вместо автора (профиль): «📍 Исаакиевская площадь» → на карту; без координат — «Без места», не нажимается */
function PlaceTag({ p, t }: { p: Photo; t: Date }) {
  const showOnMap = useShowPhotoOnMap();
  const can = hasPlace(p);
  const name = p.place_name || (can ? 'Место на карте' : 'Без места');
  const time = `${pad(t.getHours())}:${pad(t.getMinutes())} · ${ago(t)}`;
  return (
    <Pressable
      onPress={can ? () => showOnMap(p) : undefined}
      disabled={!can}
      style={({ pressed }) => [styles.author, styles.place, pressed && { opacity: 0.6 }]}
      accessibilityRole={can ? 'link' : 'text'}
      accessibilityLabel={can ? `${name}, ${time}. Показать на карте` : `Без места, ${time}`}
    >
      <View style={[styles.pinBox, !can && { backgroundColor: D.paper2 }]}>
        <Icon name="pin" size={16} color={can ? D.sun : D.ink60} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={[styles.name, !can && { color: D.ink60 }]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {time}
        </Text>
      </View>
      {can && <Icon name="chevR" size={16} color={D.ink60} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { gap: 28 },
  card: { gap: 12 },
  photo: { width: '100%', borderRadius: 20, backgroundColor: D.paper2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  author: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  ava: { width: 32, height: 32, borderRadius: 16 },
  place: { minHeight: 44 }, // зона нажатия ≥ 44 pt
  pinBox: { width: 32, height: 32, borderRadius: 16, backgroundColor: D.sunSoft, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: F.sansSemi, fontSize: 14, color: D.ink },
  sub: { fontFamily: F.sans, fontSize: 12, color: D.ink60 },
  like: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 8 },
  count: { fontFamily: F.sansMedium, fontSize: 14, color: D.ink },
  caption: { fontFamily: F.sans, fontSize: 14, lineHeight: 20, color: D.ink },
});
