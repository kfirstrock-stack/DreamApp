// D2 · Совпадение: ваше фото и чужое рядом по месту и времени. Автор → D3, «Посмотреть фото …» → фото, «Это не я — скрыть» — навсегда
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line } from 'react-native-svg';
import { RoundButton } from '@/components/ui/RoundButton';
import { useAuth } from '@/lib/auth';
import { D, F } from '@/lib/design';
import { photoSource } from '@/lib/photos';
import { cachedMatch, dative, dayUpper, dismissMatch, fetchMatches, fetchStats, genitive, hm, matchKey, plural, type Match } from '@/lib/profileData';

export default function MatchScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { session } = useAuth();
  const [m, setM] = useState<Match | null>(() => cachedMatch(key));
  const [moments, setMoments] = useState<number | null>(null);

  useEffect(() => {
    if (!m) fetchMatches().then((list) => setM(list.find((x) => matchKey(x) === key) ?? null)).catch(() => {});
  }, [key, m]);
  useEffect(() => {
    if (m) fetchStats(m.other_user_id).then((s) => setMoments(s.moments)).catch(() => {});
  }, [m]);

  if (!m) return <View style={styles.root} />;

  const who = m.other_name || m.other_username || 'автор';
  const first = who.trim().split(/\s+/)[0];
  const mine = new Date(m.my_taken_at);
  const theirs = new Date(m.other_taken_at);
  const meters = Math.max(10, Math.round(m.distance_m / 10) * 10);
  const mins = Math.round(m.minutes_apart);
  const chip = `≈ ${meters} м · ${mins === 0 ? 'та же минута' : `${mins} ${plural(mins, 'минута', 'минуты', 'минут')}`}`;
  const s = Math.min(1, (width - 48) / 345); // полароиды и карта — по ширине экрана (макет 393)

  const hide = () => {
    if (!session) return;
    dismissMatch(session.user.id, m)
      .then(() => router.back())
      .catch(() => Alert.alert('Не получилось', 'Проверьте интернет и попробуйте ещё раз.'));
  };
  const openAuthor = () => router.push({ pathname: '/user/[id]', params: { id: m.other_user_id } });

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 9, paddingBottom: Math.max(insets.bottom, 16) + 8 }} showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: 16 }}>
          <RoundButton icon="back" label="Назад" onPress={() => router.back()} />
        </View>
        <View style={styles.body}>
          <Text style={styles.kicker}>СОВПАДЕНИЕ</Text>
          <Text style={styles.title}>Вы могли попасть в кадр к {dative(who)}</Text>

          {/* два снимка-полароида и расстояние между ними */}
          <View style={{ height: 233 * s, marginTop: 10, marginHorizontal: -24 }}>
            <Polaroid source={photoSource(m.my_storage_path)} caption={`ВЫ · ${hm(mine)}`} cx={115.3} cy={105.5} rot={-5} s={s} w={width} />
            <Polaroid source={photoSource(m.other_storage_path)} caption={`${first.toUpperCase()} · ${hm(theirs)}`} cx={276.1} cy={113.3} rot={5} s={s} w={width} />
            <View style={[styles.chip, { top: 206 * s }]}>
              <Text style={styles.chipText}>{chip}</Text>
            </View>
          </View>

          <MiniMap m={m} who={first} label={`${(m.place_name ?? '').toUpperCase()}${m.place_name ? ' · ' : ''}${dayUpper(mine)}`} />

          <Pressable onPress={openAuthor} style={styles.author} accessibilityLabel={`Профиль: ${who}`}>
            {m.other_avatar ? (
              <Image source={{ uri: m.other_avatar }} style={styles.ava} />
            ) : (
              <View style={[styles.ava, styles.avaEmpty]}>
                <Text style={styles.avaLetter}>{who.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View style={{ gap: 2, flex: 1 }}>
              <Text style={styles.authorName} numberOfLines={1}>
                {who}
              </Text>
              <Text style={styles.authorSub} numberOfLines={1}>
                {m.other_username ? `@${m.other_username}` : ''}
                {moments != null ? ` · ${moments} ${plural(moments, 'момент', 'момента', 'моментов')}` : ''}
              </Text>
            </View>
          </Pressable>

          <Pressable
            onPress={() => router.push({ pathname: '/photo/[id]', params: { id: m.other_photo_id } })}
            style={({ pressed }) => [styles.button, pressed && { opacity: 0.88 }]}
          >
            <Text style={styles.buttonText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
              Посмотреть фото {genitive(who)}
            </Text>
          </Pressable>
          {/* 32 pt от кнопки и зона нажатия 45 pt, не заходящая на кнопку */}
          <Pressable onPress={hide} hitSlop={{ left: 16, right: 16 }} style={styles.hide}>
            <Text style={styles.hideText}>Это не я — скрыть</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function Polaroid({ source, caption, cx, cy, rot, s, w }: { source: any; caption: string; cx: number; cy: number; rot: number; s: number; w: number }) {
  // координаты центра — в макете 393 pt; на узком экране сдвигаем к центру и уменьшаем
  const left = w / 2 + (cx - 393 / 2) * s - 79;
  const top = cy * s - 99;
  return (
    <View style={[styles.polaroid, { left, top, transform: [{ rotate: `${rot}deg` }, { scale: s }] }]}>
      <Image source={source} style={styles.polaroidImg} contentFit="cover" />
      <Text style={styles.polaroidCap}>{caption}</Text>
    </View>
  );
}

/** Схема: две точки и пунктир между ними, направление — по настоящим координатам */
function MiniMap({ m, who, label }: { m: Match; who: string; label: string }) {
  const [w, setW] = useState(345);
  const dx = (m.other_lng - m.my_lng) * Math.cos((m.my_lat * Math.PI) / 180) * 111320;
  const dy = -(m.other_lat - m.my_lat) * 110540;
  const len = Math.hypot(dx, dy);
  let ux = 0.986, uy = -0.164; // как в макете, если точки совпали
  if (len > 1) {
    ux = dx / len;
    uy = dy / len;
  }
  const L = 60;
  const cx = w / 2, cy = 52;
  const a = { x: cx - ux * L, y: Math.min(76, Math.max(26, cy - uy * L * 0.6)) };
  const b = { x: cx + ux * L, y: Math.min(76, Math.max(26, cy + uy * L * 0.6)) };
  return (
    <View style={styles.map} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <View style={styles.blocks}>
        {Array.from({ length: 6 }, (_, r) => (
          <View key={r} style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
            {Array.from({ length: 10 }, (_, c) => (
              <View key={c} style={styles.block} />
            ))}
          </View>
        ))}
      </View>
      <Svg style={StyleSheet.absoluteFill}>
        <Line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={D.sun} strokeWidth={2} strokeDasharray="4 4" />
      </Svg>
      <View style={[styles.dot, { left: a.x - 8, top: a.y - 8, backgroundColor: D.ink }]} />
      <View style={[styles.dot, { left: b.x - 8, top: b.y - 8, backgroundColor: D.sun }]} />
      <Text style={[styles.dotLabel, { left: a.x - 10, top: a.y + 14, color: D.ink }]}>ВЫ</Text>
      <Text style={[styles.dotLabel, { left: b.x - 8, top: b.y + 14, color: D.sun }]}>{who.toUpperCase()}</Text>
      <Text style={styles.mapLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: D.paper },
  body: { paddingHorizontal: 24 },
  kicker: { marginTop: 18, fontFamily: F.mono, fontSize: 12, letterSpacing: 0.72, color: D.sun },
  title: { marginTop: 6, fontFamily: F.serif, fontSize: 30, lineHeight: 36, color: D.ink },
  polaroid: {
    position: 'absolute',
    width: 158,
    backgroundColor: D.white,
    borderRadius: 6,
    paddingTop: 8,
    paddingHorizontal: 8,
    paddingBottom: 10,
    gap: 8,
    shadowColor: '#17120D',
    shadowOpacity: 0.22,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 14 },
  },
  polaroidImg: { width: 142, height: 160, borderRadius: 2, backgroundColor: D.paper2 },
  polaroidCap: { fontFamily: F.monoRegular, fontSize: 9, letterSpacing: 0.36, color: D.ink60 },
  chip: { position: 'absolute', alignSelf: 'center', backgroundColor: D.ink, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontFamily: F.mono, fontSize: 12, color: D.paper },
  map: { marginTop: 17, height: 120, borderRadius: 20, backgroundColor: D.mapBase, overflow: 'hidden' },
  blocks: { position: 'absolute', left: -140, top: -60, transform: [{ rotate: '14deg' }] },
  block: { width: 60, height: 40, borderRadius: 4, backgroundColor: '#E2D9C9' },
  dot: { position: 'absolute', width: 16, height: 16, borderRadius: 8, borderWidth: 3, borderColor: D.white },
  dotLabel: { position: 'absolute', fontFamily: F.mono, fontSize: 10, letterSpacing: 0.6 },
  mapLabel: { position: 'absolute', left: 14, right: 14, bottom: 12, fontFamily: F.mono, fontSize: 10, letterSpacing: 0.6, color: D.ink60 },
  author: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18 },
  ava: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: D.white, backgroundColor: D.paper2 },
  avaEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: D.sun },
  avaLetter: { fontFamily: F.sansSemi, fontSize: 16, color: D.white },
  authorName: { fontFamily: F.sansSemi, fontSize: 15, color: D.ink },
  authorSub: { fontFamily: F.sans, fontSize: 13, color: D.ink60 },
  button: { marginTop: 14, backgroundColor: D.sun, borderRadius: 999, paddingVertical: 17, paddingHorizontal: 20, alignItems: 'center' },
  buttonText: { fontFamily: F.sansSemi, fontSize: 16, lineHeight: 20, color: D.white },
  hide: { alignSelf: 'center', marginTop: 32 - 13, paddingVertical: 13 },
  hideText: { fontFamily: F.sansSemi, fontSize: 15, color: D.ink60 },
});
