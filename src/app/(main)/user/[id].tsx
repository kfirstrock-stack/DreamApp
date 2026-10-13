// D3 · Чужой профиль: моменты и лайки автора, общие совпадения. ⋯ → скрыть автора
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { PhotoCards } from '@/components/feed/PhotoCards';
import { ViewToggle } from '@/components/feed/ViewToggle';
import { PillButton } from '@/components/ui/PillButton';
import { RoundButton } from '@/components/ui/RoundButton';
import { SheetGrab } from '@/components/ui/SheetGrab';
import { Stagger } from '@/components/ui/Stagger';
import { useAuth } from '@/lib/auth';
import { D, F, SHEET_SPRING } from '@/lib/design';
import { openPhotoFeed, useViewMode } from '@/lib/feed';
import { hideAuthor, photoSource } from '@/lib/photos';
import { compact, dayLower, fetchAuthorPhotos, fetchMatches, fetchProfile, fetchStats, monthYearUpper, nickLine, plural, type Match, type Stats } from '@/lib/profileData';
import type { Photo, Profile } from '@/lib/types';

export default function UserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { session } = useAuth();
  const [p, setP] = useState<Profile | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [common, setCommon] = useState<Match[]>([]);
  const [menu, setMenu] = useState(false);
  const [mode, setMode] = useViewMode(); // 13.10: «Сетка / Лента»

  useEffect(() => {
    if (session?.user.id === id) return void router.replace('/profile');
    fetchProfile(id).then(setP).catch(() => {});
    fetchStats(id).then(setStats).catch(() => {});
    fetchAuthorPhotos(id).then(setPhotos).catch(() => setPhotos([]));
    if (session) fetchMatches().then((l) => setCommon(l.filter((m) => m.other_user_id === id))).catch(() => {});
  }, [id, session]);

  const name = p?.display_name || p?.username || ' ';
  const tile = (width - 48 - 16) / 3;
  const first = common[0];
  const hide = () => {
    setMenu(false);
    if (!session) return router.push('/sign-in');
    hideAuthor(session.user.id, id)
      .then(() => {
        Alert.alert('Автор скрыт', 'Его фото больше не появятся у вас на карте. Вернуть можно в настройках.');
        router.back();
      })
      .catch(() => Alert.alert('Не получилось', 'Проверьте интернет и попробуйте ещё раз.'));
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 9, paddingBottom: Math.max(insets.bottom, 16) + 16 }} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <RoundButton icon="back" label="Назад" onPress={() => router.back()} />
          <View style={styles.topRight}>
            <ViewToggle mode={mode} onChange={setMode} />
            <RoundButton icon="more" label="Ещё" onPress={() => setMenu(true)} />
          </View>
        </View>

        <Stagger i={0}>
        <View style={styles.head}>
          {p?.avatar_url ? (
            <Image source={{ uri: p.avatar_url }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={[styles.avatar, styles.avatarEmpty]}>
              <Text style={styles.avatarLetter}>{name.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <View style={{ flex: 1, marginLeft: 16 }}>
            <Text style={styles.name} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {name}
            </Text>
            {/* нет ни ника, ни города — строку не показываем (D3 · без ника и города, 12.10) */}
            {nickLine(p) ? (
              <Text style={styles.nick} numberOfLines={1}>
                {nickLine(p)}
              </Text>
            ) : null}
            <Text style={styles.since}>{p?.created_at ? `В DREAMAPP С ${monthYearUpper(new Date(p.created_at))}` : ' '}</Text>
          </View>
        </View>

        </Stagger>
        <Stagger i={1}>
        <View style={styles.stats}>
          <Stat n={stats?.moments ?? 0} label={plural(stats?.moments ?? 0, 'момент', 'момента', 'моментов')} />
          <Stat n={stats?.likes ?? 0} label={plural(stats?.likes ?? 0, 'лайк', 'лайка', 'лайков')} />
          <Stat n={stats?.places ?? 0} label={plural(stats?.places ?? 0, 'место', 'места', 'мест')} />
        </View>

        </Stagger>
        <Stagger i={2}>
        {first && (
          <Pressable onPress={() => router.push({ pathname: '/match', params: { key: `${first.my_photo_id}:${first.other_photo_id}` } })} style={styles.common}>
            <Icon name="sparkle" size={18} color={D.sun} />
            <Text style={styles.commonText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {common.length} {plural(common.length, 'совпадение', 'совпадения', 'совпадений')} с вами
              {first.place_name ? ` · ${first.place_name}` : ''}, {dayLower(new Date(first.other_taken_at))}
            </Text>
          </Pressable>
        )}

        </Stagger>
        <Stagger i={3}>
        {mode === 'cards' ? (
          <View style={{ marginTop: first ? 20 : 21 }}>
            <PhotoCards photos={photos ?? []} onOpen={(ph) => openPhotoFeed(ph.id, photos ?? [])} showAuthor={false} inset={24} />
          </View>
        ) : (
        <View style={[styles.grid, { marginTop: first ? 20 : 21 }]}>
          {(photos ?? []).map((ph) => (
            <Pressable key={ph.id} onPress={() => openPhotoFeed(ph.id, photos ?? [])} style={[styles.photo, { width: tile, height: tile }]}>
              <Image source={photoSource(ph.storage_path)} style={StyleSheet.absoluteFill} contentFit="cover" />
              {(ph.like_count ?? 0) > 0 && (
                <View style={styles.likes}>
                  <Icon name="heart" size={12} color={D.white} />
                  <Text style={styles.likesText}>{compact(ph.like_count ?? 0)}</Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>
        )}
        </Stagger>
      </ScrollView>

      {menu && (
        <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenu(false)} />
          <Animated.View
            entering={SlideInDown.springify().damping(SHEET_SPRING.damping).stiffness(SHEET_SPRING.stiffness).mass(SHEET_SPRING.mass)}
            exiting={SlideOutDown.duration(220)}
            style={[styles.menu, { paddingBottom: insets.bottom + 16 }]}
          >
            <SheetGrab />
            <Pressable onPress={hide} style={({ pressed }) => [styles.menuRow, pressed && { opacity: 0.6 }]}>
              <Icon name="eyeOff" size={22} color={D.ink} />
              <Text style={styles.menuText}>Скрыть фото этого автора</Text>
            </Pressable>
            <PillButton title="Отмена" kind="quiet" onPress={() => setMenu(false)} style={{ marginTop: 12, height: 54 }} />
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statN} numberOfLines={1} adjustsFontSizeToFit>
        {compact(n)}
      </Text>
      <Text style={styles.statL} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: D.paper },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16 },
  topRight: { flexDirection: 'row', gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, marginTop: 16 },
  avatar: { width: 84, height: 84, borderRadius: 42, borderWidth: 3, borderColor: D.white, backgroundColor: D.paper2 },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: D.sun },
  avatarLetter: { fontFamily: F.serif, fontSize: 36, color: D.white },
  name: { fontFamily: F.serif, fontSize: 30, color: D.ink },
  nick: { marginTop: 4, marginLeft: 2, fontFamily: F.mono, fontSize: 11, letterSpacing: 0.66, color: D.ink60 },
  since: { marginTop: 4, marginLeft: 2, fontFamily: F.monoRegular, fontSize: 11, letterSpacing: 0.66, color: D.ink60 },
  stats: { flexDirection: 'row', gap: 10, paddingHorizontal: 24, marginTop: 22 },
  stat: { flex: 1, backgroundColor: D.white, borderRadius: 18, paddingTop: 12, paddingBottom: 14, paddingHorizontal: 16 },
  statN: { fontFamily: F.serif, fontSize: 28, color: D.ink },
  statL: { fontFamily: F.sans, fontSize: 12, color: D.ink60 },
  common: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 24, marginTop: 15, backgroundColor: D.sunSoft, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 12 },
  commonText: { flex: 1, fontFamily: F.sansMedium, fontSize: 14, color: D.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 24 },
  photo: { borderRadius: 14, overflow: 'hidden', backgroundColor: D.paper2 },
  likes: { position: 'absolute', left: 6, bottom: 6, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(15,14,12,0.5)', borderRadius: 999, paddingLeft: 6, paddingRight: 8, paddingVertical: 3 },
  likesText: { fontFamily: F.monoRegular, fontSize: 10, color: D.white },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,14,12,0.55)', justifyContent: 'flex-end' },
  menu: { backgroundColor: D.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 10 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 15 },
  menuText: { flex: 1, fontFamily: F.sans, fontSize: 17, color: D.ink },
});
