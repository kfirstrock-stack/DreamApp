// D1 · Мой профиль: счётчики, совпадения (листаются вбок), мои моменты. Шестерёнка → D5, имя → D4, совпадение → D2
// Утверждено 11.10: шестерёнка вместо «Поделиться», карусель совпадений, подсказки в пустых разделах.
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { RoundButton } from '@/components/ui/RoundButton';
import { Stagger } from '@/components/ui/Stagger';
import { TAB_BAR_SPACE, TabBar } from '@/components/ui/TabBar';
import { useAuth } from '@/lib/auth';
import { D, F } from '@/lib/design';
import { requestMapFocus } from '@/lib/focus';
import { photoSource } from '@/lib/photos';
import {
  compact, dative, dayUpper, genitive, fetchAuthorPhotos, fetchMatches, fetchStats, hm, matchKey, monthYearUpper, nickLine, plural, type Match, type Stats,
} from '@/lib/profileData';
import { supabase } from '@/lib/supabase';
import type { Photo } from '@/lib/types';

const GAP = 10;
// в макете 393 pt: поля по 20, карточка 338 — справа выглядывает следующая

const SHOWN = 5; // совпадений в карусели D1

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const content = width - 40;
  const cardW = content - 15;
  const { session, profile } = useAuth();
  const uid = session?.user.id;
  const [stats, setStats] = useState<Stats | null>(null);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [since, setSince] = useState<Date | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!uid) return;
      fetchStats(uid).then(setStats).catch(() => {});
      fetchMatches().then(setMatches).catch(() => setMatches([]));
      fetchAuthorPhotos(uid).then(setPhotos).catch(() => setPhotos([]));
      supabase.from('profiles').select('created_at').eq('id', uid).maybeSingle().then(({ data }) => data?.created_at && setSince(new Date(data.created_at)));
    }, [uid]),
  );

  // вышли из аккаунта — на вход, но не во время отрисовки (иначе React ругается «Cannot update a component…»)
  useEffect(() => {
    if (!session) router.replace('/sign-in');
  }, [session]);
  if (!session) return <View style={styles.root} />;

  const name = profile?.display_name || profile?.username || 'Вы';
  const tile = (content - 16) / 3;
  const onMap = () => {
    const last = photos?.[0];
    if (last) requestMapFocus({ lat: last.lat, lng: last.lng, at: new Date(last.taken_at) });
    router.dismissTo('/');
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 9, paddingBottom: TAB_BAR_SPACE + Math.max(insets.bottom, 12) + 24 }} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <RoundButton icon="settings" label="Настройки" onPress={() => router.push('/settings')} />
        </View>

        <Stagger i={0}>
        <Pressable onPress={() => router.push('/profile-edit')} style={styles.head} accessibilityLabel="Редактировать профиль">
          {profile?.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={[styles.avatar, styles.avatarEmpty]}>
              <Text style={styles.avatarLetter}>{name.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <View style={{ flex: 1, marginLeft: 18 }}>
            <Text style={styles.name} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {name}
            </Text>
            {/* 12.10: как у всех — ник · город, ниже «В DreamApp с …» */}
            {/* нет ни ника, ни города — строку не показываем, «В DreamApp с …» встаёт под имя (12.10) */}
            {nickLine(profile) ? (
              <Text style={styles.nick} numberOfLines={1}>
                {nickLine(profile)}
              </Text>
            ) : null}
            <Text style={styles.since}>{since ? `В DREAMAPP С ${monthYearUpper(since)}` : ' '}</Text>
          </View>
        </Pressable>
        </Stagger>

        <Stagger i={1}>
        <View style={styles.stats}>
          <Stat n={stats?.moments ?? 0} label={plural(stats?.moments ?? 0, 'момент', 'момента', 'моментов')} />
          <Stat n={stats?.likes ?? 0} label={plural(stats?.likes ?? 0, 'лайк', 'лайка', 'лайков')} />
          <Stat n={matches?.length ?? 0} label={plural(matches?.length ?? 0, 'совпадение', 'совпадения', 'совпадений')} accent />
        </View>
        </Stagger>

        <Stagger i={2}>
        {/* 12.10: в карусели 5 последних (подтверждённые первыми), остальные — «Все N →» (D10) */}
        <View style={[styles.momentsHead, { marginTop: 29 }]}>
          <Text style={styles.label}>СОВПАДЕНИЯ</Text>
          {matches && matches.length > SHOWN && (
            <Pressable onPress={() => router.push('/matches')} hitSlop={12} accessibilityLabel={`Все совпадения: ${matches.length}`}>
              <Text style={styles.link}>Все {matches.length} →</Text>
            </Pressable>
          )}
        </View>
        {matches && matches.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={cardW + GAP}
            decelerationRate="fast"
            contentContainerStyle={{ paddingHorizontal: 20, gap: GAP }}
            style={{ marginTop: 9 }}
          >
            {matches.slice(0, SHOWN).map((m) => (
              <MatchCard key={matchKey(m)} m={m} w={matches.length === 1 ? content : cardW} />
            ))}
          </ScrollView>
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Пока никого рядом</Text>
            <Text style={styles.emptyText}>Выкладывайте снимки — покажем, когда кто-то снимал там же и в то же время.</Text>
          </View>
        )}
        </Stagger>

        <Stagger i={3}>
        <View style={styles.momentsHead}>
          <Text style={styles.label}>МОИ МОМЕНТЫ</Text>
          {photos && photos.length > 0 && (
            <Pressable onPress={onMap} hitSlop={12}>
              <Text style={styles.link}>на карте →</Text>
            </Pressable>
          )}
        </View>
        <View style={styles.grid}>
          {photos && photos.length === 0 && (
            <Pressable onPress={() => router.push('/new')} style={[styles.first, { width: tile, height: tile }]} accessibilityLabel="Первый момент">
              <Text style={styles.firstPlus}>+</Text>
              <Text style={styles.firstText}>Первый момент</Text>
            </Pressable>
          )}
          {(photos ?? []).map((p) => (
            <Pressable key={p.id} onPress={() => router.push({ pathname: '/photo/[id]', params: { id: p.id } })} style={[styles.moment, { width: tile, height: tile }]}>
              <Image source={photoSource(p.storage_path)} style={StyleSheet.absoluteFill} contentFit="cover" />
              <View style={styles.year}>
                <Text style={styles.yearText}>{new Date(p.taken_at).getFullYear()}</Text>
              </View>
            </Pressable>
          ))}
        </View>
        </Stagger>
      </ScrollView>

      <View pointerEvents="none" style={styles.fade} />
      <TabBar
        active="profile"
        onMap={() => router.dismissTo('/')}
        onMoments={() => router.dismissTo('/')}
        onAdd={() => router.push('/new')}
        onProfile={() => {}}
      />
    </View>
  );
}

function Stat({ n, label, accent }: { n: number; label: string; accent?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statN, accent && { color: D.sun }]} numberOfLines={1} adjustsFontSizeToFit>
        {compact(n)}
      </Text>
      <Text style={styles.statL} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
        {label}
      </Text>
    </View>
  );
}

function MatchCard({ m, w }: { m: Match; w: number }) {
  const who = m.other_name || m.other_username || 'автор';
  const t = new Date(m.other_taken_at);
  const place = (m.place_name ?? '').toUpperCase();
  const meta = [place, dayUpper(t), hm(t)].filter(Boolean).join(' · ');
  const open = () => router.push({ pathname: '/match', params: { key: matchKey(m) } });
  return (
    <Pressable onPress={open} style={[styles.card, { width: w }]}>
      <View style={[styles.mini, { left: 9.2, top: 34.1, transform: [{ rotate: '8deg' }] }]}>
        <Image source={photoSource(m.my_storage_path)} style={styles.miniImg} contentFit="cover" />
      </View>
      <View style={[styles.mini, { left: 55.7, top: 23.9, transform: [{ rotate: '-7deg' }] }]}>
        <Image source={photoSource(m.other_storage_path)} style={styles.miniImg} contentFit="cover" />
      </View>
      <Text style={styles.cardTitle} numberOfLines={2}>
        {m.confirmed ? `Вы в кадре у ${genitive(who)} ✓` : `Вы могли попасть в кадр к ${dative(who)}`}
      </Text>
      <Text style={styles.cardMeta} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {meta}
      </Text>
      <View style={styles.cardBtn}>
        <Text style={styles.cardBtnText}>Посмотреть</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: D.paper },
  topRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16 },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginTop: 4 },
  avatar: { width: 84, height: 84, borderRadius: 42, borderWidth: 3, borderColor: D.white, backgroundColor: D.paper2 },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: D.sun },
  avatarLetter: { fontFamily: F.serif, fontSize: 36, color: D.white },
  name: { fontFamily: F.serif, fontSize: 32, color: D.ink },
  nick: { marginTop: 2, marginLeft: 2, fontFamily: F.mono, fontSize: 11, letterSpacing: 0.66, color: D.ink60 },
  since: { marginTop: 4, marginLeft: 2, fontFamily: F.monoRegular, fontSize: 11, letterSpacing: 0.66, color: D.ink60 },
  stats: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginTop: 20 },
  stat: { flex: 1, backgroundColor: D.white, borderRadius: 18, paddingTop: 12, paddingBottom: 14, paddingHorizontal: 16 },
  statN: { fontFamily: F.serif, fontSize: 30, color: D.ink },
  statL: { fontFamily: F.sans, fontSize: 12, color: D.ink60 },
  label: { marginLeft: 20, fontFamily: F.mono, fontSize: 11, letterSpacing: 0.88, color: D.ink60 },
  card: { height: 128, borderRadius: 24, backgroundColor: D.ink, overflow: 'hidden' },
  mini: { position: 'absolute', width: 64, height: 64, borderRadius: 10, borderWidth: 3, borderColor: D.paper, overflow: 'hidden', backgroundColor: D.night3 },
  miniImg: { width: '100%', height: '100%' },
  cardTitle: { position: 'absolute', left: 132, top: 20, right: 14, fontFamily: F.sansSemi, fontSize: 15, lineHeight: 20, color: D.paper },
  cardMeta: { position: 'absolute', left: 132, top: 62, right: 14, fontFamily: F.monoRegular, fontSize: 10, letterSpacing: 0.4, color: 'rgba(244,239,230,0.55)' },
  cardBtn: { position: 'absolute', left: 132, top: 84, backgroundColor: D.sun, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  cardBtnText: { fontFamily: F.sansSemi, fontSize: 13, color: D.white },
  empty: { marginTop: 9, marginHorizontal: 20, backgroundColor: D.white, borderRadius: 24, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 20, gap: 6 },
  emptyTitle: { fontFamily: F.sansSemi, fontSize: 15, color: D.ink },
  emptyText: { fontFamily: F.sans, fontSize: 13, lineHeight: 18, color: D.ink60 },
  momentsHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, paddingRight: 23 },
  link: { fontFamily: F.sansSemi, fontSize: 13, color: D.sun },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, marginTop: 9 },
  moment: { borderRadius: 14, overflow: 'hidden', backgroundColor: D.paper2 },
  year: { position: 'absolute', left: 6, bottom: 6, backgroundColor: 'rgba(15,14,12,0.5)', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  yearText: { fontFamily: F.mono, fontSize: 10, color: D.white },
  first: { borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#9E9485', backgroundColor: '#E2D9C9', alignItems: 'center', justifyContent: 'center', gap: 4 },
  firstPlus: { fontFamily: F.sans, fontSize: 30, lineHeight: 34, color: D.ink },
  firstText: { fontFamily: F.sansSemi, fontSize: 12, color: D.ink },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 120, experimental_backgroundImage: 'linear-gradient(180deg, rgba(244,239,230,0) 0%, #F4EFE6 100%)' },
});
