// D2 · Совпадение: ваше фото и чужое рядом по месту и времени. Автор → D3, «Посмотреть фото …» → фото,
// «Это я» — отметка для себя (D2 · Вы в кадре, отменяется), «Это не я — скрыть» — из меню ⋯, с отменой
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from '@/components/ui/Text';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line } from 'react-native-svg';
import { Icon } from '@/components/Icon';
import { PillButton } from '@/components/ui/PillButton';
import { RoundButton } from '@/components/ui/RoundButton';
import { SheetGrab } from '@/components/ui/SheetGrab';
import { Stagger } from '@/components/ui/Stagger';
import { useAuth } from '@/lib/auth';
import { D, F, SHEET_SPRING } from '@/lib/design';
import { photoSource } from '@/lib/photos';
import { cachedMatch, dative, dayUpper, dismissMatch, restoreMatch, setMatchConfirmed, fetchMatches, fetchStats, genitive, hm, matchKey, plural, type Match } from '@/lib/profileData';
import { useSnack } from '@/lib/snack';

export default function MatchScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { session } = useAuth();
  const snack = useSnack();
  const [m, setM] = useState<Match | null>(() => cachedMatch(key));
  const [moments, setMoments] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);

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
  const s = Math.min(1, (width - 48) / 345);
  const uid = session?.user.id;

  const hide = () => {
    if (!uid) return;
    const kept = m;
    setMenu(false);
    dismissMatch(uid, kept)
      .then(() => {
        router.back();
        snack.show({
          message: 'Совпадение скрыто',
          actionLabel: 'Вернуть',
          duration: 5000,
          onAction: () => {
            restoreMatch(uid, kept).catch(() => {
              Alert.alert('Не получилось вернуть', 'Проверьте интернет и попробуйте ещё раз.');
            });
          },
        });
      })
      .catch(() => Alert.alert('Не получилось', 'Проверьте интернет и попробуйте ещё раз.'));
  };
  const confirm = (on: boolean) => {
    if (!session) return;
    setM({ ...m, confirmed: on });
    setMatchConfirmed(session.user.id, m, on).catch(() => {
      setM({ ...m, confirmed: !on });
      Alert.alert('Не получилось', 'Проверьте интернет и попробуйте ещё раз.');
    });
  };
  const openAuthor = () => router.push({ pathname: '/user/[id]', params: { id: m.other_user_id } });

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 9, paddingBottom: Math.max(insets.bottom, 16) + 8 }} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <RoundButton icon="back" label="Назад" onPress={() => router.back()} />
          <RoundButton icon="more" label="Ещё" onPress={() => setMenu(true)} />
        </View>
        <View style={styles.body}>
          <Stagger i={0}>
          <Text style={styles.kicker}>{m.confirmed ? 'ВЫ В КАДРЕ ✓' : 'СОВПАДЕНИЕ'}</Text>
          <Text style={styles.title}>{m.confirmed ? `Вы в кадре у ${genitive(who)}` : `Вы могли попасть в кадр к ${dative(who)}`}</Text>
          </Stagger>
          <Stagger i={1}>
          <View style={{ height: 233 * s, marginTop: 10, marginHorizontal: -24 }}>
            <Polaroid source={photoSource(m.my_storage_path)} caption={`ВЫ · ${hm(mine)}`} cx={115.3} cy={105.5} rot={-5} s={s} w={width} />
            <Polaroid source={photoSource(m.other_storage_path)} caption={`${first.toUpperCase()} · ${hm(theirs)}`} cx={276.1} cy={113.3} rot={5} s={s} w={width} />
            <View style={[styles.chip, { top: 206 * s }]}>
              <Text style={styles.chipText}>{chip}</Text>
            </View>
          </View>
          </Stagger>
          <Stagger i={2}>
          <MiniMap m={m} who={first} label={`${(m.place_name ?? '').toUpperCase()}${m.place_name ? ' · ' : ''}${dayUpper(mine)}`} />
          </Stagger>
          <Stagger i={3}>
          <Pressable onPress={openAuthor} style={styles.author} accessibilityLabel={`Профиль: ${who}`}>
            {m.other_avatar ? (
              <Image source={{ uri: m.other_avatar }} style={styles.ava} />
            ) : (
              <View style={[styles.ava, styles.avaEmpty]}>
                <Text style={styles.avaLetter}>{who.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View style={{ gap: 2, flex: 1 }}>
              <Text style={styles.authorName} numberOfLines={1}>{who}</Text>
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
          {m.confirmed ? (
            <Pressable onPress={() => confirm(false)} hitSlop={{ left: 16, right: 16 }} style={styles.hide}>
              <Text style={styles.hideText}>Отменить «Это я»</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => confirm(true)} hitSlop={{ left: 16, right: 16 }} style={styles.hide} accessibilityLabel="Это я — отметить, что вы в кадре">
              <Text style={styles.confirmText}>Это я</Text>
            </Pressable>
          )}
          </Stagger>
        </View>
      </ScrollView>

      {menu && (
        <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} style={styles.backdrop} accessibilityViewIsModal>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenu(false)} accessibilityLabel="Закрыть меню" />
          <Animated.View
            entering={SlideInDown.springify().damping(SHEET_SPRING.damping).stiffness(SHEET_SPRING.stiffness).mass(SHEET_SPRING.mass)}
            exiting={SlideOutDown.duration(220)}
            style={[styles.menu, { paddingBottom: insets.bottom + 16 }]}
          >
            <SheetGrab />
            <Pressable onPress={hide} style={({ pressed }) => [styles.menuRow, pressed && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel="Это не я — скрыть совпадение">
              <Icon name="eyeOff" size={22} color={D.ink} />
              <Text style={styles.menuText}>Это не я — скрыть</Text>
            </Pressable>
            <PillButton title="Отмена" kind="quiet" onPress={() => setMenu(false)} style={{ marginTop: 12, height: 54 }} />
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}

function Polaroid({ source, caption, cx, cy, rot, s, w }: { source: any; caption: string; cx: number; cy: number; rot: number; s: number; w: number }) {
  const left = w / 2 + (cx - 393 / 2) * s - 79;
  const top = cy * s - 99;
  return (
    <View style={[styles.polaroid, { left, top, transform: [{ rotate: `${rot}deg` }, { scale: s }] }]}>
      <Image source={source} style={styles.polaroidImg} contentFit="cover" />
      <Text style={styles.polaroidCap} maxFontSizeMultiplier={1.3}>{caption}</Text>
    </View>
  );
}

/** Схема: две точки и пунктир между ними. Место и дата — сверху, чтобы не пересекаться с «ВЫ». */
function MiniMap({ m, who, label }: { m: Match; who: string; label: string }) {
  const [w, setW] = useState(345);
  const dx = (m.other_lng - m.my_lng) * Math.cos((m.my_lat * Math.PI) / 180) * 111320;
  const dy = -(m.other_lat - m.my_lat) * 110540;
  const len = Math.hypot(dx, dy);
  let ux = 0.986, uy = -0.164;
  if (len > 1) {
    ux = dx / len;
    uy = dy / len;
  }
  const L = 60;
  const cx = w / 2, cy = 58;
  const place = (x: number, y: number) => {
    const clampedY = Math.min(60, Math.max(32, y));
    const side = clampedY > 48;
    return { x, y: clampedY, side };
  };
  const a = place(cx - ux * L, cy - uy * L * 0.6);
  const b = place(cx + ux * L, cy + uy * L * 0.6);
  const labelPos = (p: { x: number; y: number; side: boolean }, align: 'left' | 'right') => {
    if (p.side) {
      return align === 'left'
        ? { left: p.x + 14, top: p.y - 8 }
        : { left: p.x - 10 - 48, top: p.y - 8 };
    }
    return { left: p.x - 10, top: p.y + 14 };
  };
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
      <Text style={styles.mapLabel} numberOfLines={1} maxFontSizeMultiplier={1.3}>{label}</Text>
      <Svg style={StyleSheet.absoluteFill}>
        <Line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={D.sun} strokeWidth={2} strokeDasharray="4 4" />
      </Svg>
      <View style={[styles.dot, { left: a.x - 8, top: a.y - 8, backgroundColor: D.ink }]} />
      <View style={[styles.dot, { left: b.x - 8, top: b.y - 8, backgroundColor: D.sun }]} />
      <Text style={[styles.dotLabel, labelPos(a, 'left'), { color: D.ink }]} maxFontSizeMultiplier={1.3}>ВЫ</Text>
      <Text style={[styles.dotLabel, labelPos(b, 'right'), { color: D.ink }]} maxFontSizeMultiplier={1.3}>{who.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: D.paper },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  body: { paddingHorizontal: 24 },
  kicker: { marginTop: 18, fontFamily: F.mono, fontSize: 12, letterSpacing: 0.72, color: D.ink60 },
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
  polaroidCap: { fontFamily: F.monoRegular, fontSize: 11, letterSpacing: 0.36, color: D.ink60 },
  chip: { position: 'absolute', alignSelf: 'center', backgroundColor: D.ink, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontFamily: F.mono, fontSize: 12, color: D.paper },
  map: { marginTop: 17, height: 120, borderRadius: 20, backgroundColor: D.mapBase, overflow: 'hidden' },
  blocks: { position: 'absolute', left: -140, top: -60, transform: [{ rotate: '14deg' }] },
  block: { width: 60, height: 40, borderRadius: 4, backgroundColor: D.paper2 },
  dot: { position: 'absolute', width: 16, height: 16, borderRadius: 8, borderWidth: 3, borderColor: D.white },
  dotLabel: { position: 'absolute', fontFamily: F.mono, fontSize: 11, letterSpacing: 0.6 },
  mapLabel: { position: 'absolute', left: 14, right: 14, top: 10, fontFamily: F.mono, fontSize: 11, letterSpacing: 0.6, color: D.ink60 },
  author: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18 },
  ava: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: D.white, backgroundColor: D.paper2 },
  avaEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: D.sunBtn },
  avaLetter: { fontFamily: F.sansSemi, fontSize: 16, color: D.white },
  authorName: { fontFamily: F.sansSemi, fontSize: 15, color: D.ink },
  authorSub: { fontFamily: F.sans, fontSize: 13, color: D.ink60 },
  button: { marginTop: 14, backgroundColor: D.sunBtn, borderRadius: 999, paddingVertical: 17, paddingHorizontal: 20, alignItems: 'center' },
  buttonText: { fontFamily: F.sansSemi, fontSize: 16, lineHeight: 20, color: D.white },
  hide: { alignSelf: 'center', marginTop: 32 - 13, paddingVertical: 13 },
  hideText: { fontFamily: F.sansSemi, fontSize: 15, color: D.ink60 },
  confirmText: { fontFamily: F.sansSemi, fontSize: 15, color: D.ink, textDecorationLine: 'underline' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,14,12,0.55)', justifyContent: 'flex-end' },
  menu: { backgroundColor: D.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 10 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 15, minHeight: 44 },
  menuText: { flex: 1, fontFamily: F.sans, fontSize: 17, color: D.ink },
});
