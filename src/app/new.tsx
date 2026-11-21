// C1 · Гостевой барьер и C2 · Камера или галерея (+ мультивыбор, 17.11) — листы поверх карты (дуга вместо бара — утверждено 09.10)
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { AssetField, MediaType, Query, presentPermissionsPicker, requestPermissionsAsync, type Asset } from 'expo-media-library';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Text } from '@/components/ui/Text';
import Animated, { FadeIn, LinearTransition, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { useAuth } from '@/lib/auth';
import { BATCH_LIMIT, assetPreviewUri, batchFromAsset, batchFromPicker, dayTitle, groupByDay, hhmm, libKey, plural, prepareJpeg, setBatch, useUploaded, type BatchItem } from '@/lib/batch';
import { reverseAddress } from '@/lib/places';
import { D, F, SHEET_SPRING } from '@/lib/design';
import { draftFromPicker, loadSavedDraft, setDraft, setDraftExtras, type Draft, type DraftExtras } from '@/lib/draft';
import { supabase } from '@/lib/supabase';
import { SheetGrab } from '@/components/ui/SheetGrab';

type Recent = { asset: Asset; uri: string; lat: number | null; lng: number | null; time: number | null };

const DRAFT_ROW = 84; // строка черновика 72 + отступ 12
const RECENT_COUNT = 120; // недавних в листе: поездка за несколько дней, с запасом над пределом выбора
const MON = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const pad2 = (n: number) => String(n).padStart(2, '0');
/** «Исаакиевская пл. · 14 июл, 14:07» */
const draftLine = (s: { draft: Draft; extras: DraftExtras }) => {
  const t = s.draft.takenAt;
  const when = t ? `${t.getDate()} ${MON[t.getMonth()]}${t.getFullYear() === new Date().getFullYear() ? '' : ` ${t.getFullYear()}`}, ${pad2(t.getHours())}:${pad2(t.getMinutes())}` : 'время не указано';
  return [s.extras.place, when].filter(Boolean).join(' · ');
};

export default function NewMomentSheet() {
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const { height: windowH } = useWindowDimensions();
  const close = () => router.back();
  // C2 · есть черновик (12.10): строка «Продолжить черновик» над плитками, лист выше на её высоту
  const [saved, setSaved] = useState<{ draft: Draft; extras: DraftExtras } | null>(null);
  useEffect(() => {
    if (session) loadSavedDraft().then(setSaved);
  }, [session]);
  const [full, setFull] = useState(false); // C2 v3: с недавними — шторка на всю высоту
  const spring = SlideInDown.springify().damping(SHEET_SPRING.damping).stiffness(SHEET_SPRING.stiffness).mass(SHEET_SPRING.mass);

  return (
    <Animated.View entering={FadeIn.duration(180)} style={styles.dim}>
      <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Закрыть" />
      <Animated.View
        entering={spring}
        layout={LinearTransition.duration(180)}
        // C2 с недавними — на всю высоту (v3), без них — по содержимому; C1 — как было
        style={[
          styles.sheet,
          session ? { paddingBottom: Math.max(insets.bottom, 16) + 8, ...(full && { height: windowH - insets.top }) } : { height: 460 - 34 + Math.max(insets.bottom, 16) },
        ]}
      >
        <Pressable onPress={close} style={styles.grip} hitSlop={{ top: 10, bottom: 6, left: 30, right: 30 }} accessibilityLabel="Закрыть">
          <SheetGrab />
        </Pressable>
        {session ? <Source saved={saved} onFull={setFull} /> : <Guest onClose={close} />}
      </Animated.View>
    </Animated.View>
  );
}

/** C1: войти, чтобы публиковать */
function Guest({ onClose }: { onClose: () => void }) {
  // вход открывается поверх листа; после входа лист сам станет C2 (сессия появилась)
  const signIn = () => router.push('/sign-in');
  const [avatars, setAvatars] = useState<string[]>([]);
  useEffect(() => {
    supabase
      .from('profiles')
      .select('avatar_url')
      .not('avatar_url', 'is', null)
      .limit(5)
      .then(({ data }) => setAvatars((data ?? []).map((r: any) => r.avatar_url).filter(Boolean)));
  }, []);
  return (
    <View>
      <View style={styles.avatars}>
        {avatars.map((a, i) => (
          <Image key={a} source={{ uri: a }} style={[styles.avatar, { marginLeft: i ? -12 : 0, zIndex: 10 - i }]} />
        ))}
      </View>
      <Text style={styles.gateTitle}>Войдите, чтобы опубликовать момент</Text>
      <Text style={styles.gateText}>Смотреть карту можно и так. А чтобы выложить снимок и найти совпадения, нужен профиль.</Text>
      <Pressable onPress={signIn} style={({ pressed }) => [styles.button, { marginTop: 26 }, pressed && { opacity: 0.88 }]}>
        <Text style={styles.buttonText}>Войти по почте</Text>
      </Pressable>
      <Pressable onPress={onClose} hitSlop={10} style={styles.later}>
        <Text style={styles.laterText}>Не сейчас</Text>
      </Pressable>
    </View>
  );
}

/** C2: снять сейчас, из галереи (до 50 сразу) или отметить недавние снимки по дням (C2 мультивыбор v3, 17.11) */
function Source({ saved, onFull }: { saved: { draft: Draft; extras: DraftExtras } | null; onFull: (full: boolean) => void }) {
  const { width } = useWindowDimensions();
  const [recent, setRecent] = useState<Recent[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]); // ключи выбранных, в порядке нажатий
  const [open, setOpen] = useState<Set<string>>(new Set()); // дни, раскрытые по «+N»
  const [dayPlace, setDayPlace] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  // ревью 17.11: без доступа к фото «Недавних» нет — системный выбор «Из галереи» работает и так
  const [access, setAccess] = useState<'all' | 'limited' | 'denied' | null>(null);
  const [reload, setReload] = useState(0);
  const uploaded = useUploaded();
  const thumb = (width - 48 - 24) / 4;

  useEffect(() => {
    (async () => {
      const perm = await requestPermissionsAsync().catch(() => null);
      if (!perm?.granted) {
        setAccess('denied');
        return setRecent([]);
      }
      setAccess(perm.accessPrivileges === 'limited' ? 'limited' : 'all');
      const assets = await new Query()
        .eq(AssetField.MEDIA_TYPE, MediaType.IMAGE)
        .orderBy({ key: AssetField.CREATION_TIME, ascending: false })
        .limit(RECENT_COUNT)
        .exe();
      const list = await Promise.all(
        assets.map(async (asset) => {
          const [loc, time] = await Promise.all([asset.getLocation().catch(() => null), asset.getCreationTime().catch(() => null)]);
          return { asset, uri: assetPreviewUri(asset.id), lat: loc?.latitude ?? null, lng: loc?.longitude ?? null, time };
        }),
      );
      setRecent(list);
    })().catch(() => setRecent([]));
  }, [reload]);
  const changeAccess = async () => {
    if (access === 'limited') {
      await presentPermissionsPicker().catch(() => {});
      setReload((k) => k + 1);
    } else Linking.openSettings().catch(() => {});
  };

  const days = useMemo(() => groupByDay(recent ?? [], (r) => (r.time ? new Date(r.time) : null)), [recent]);
  const sel = useMemo(() => new Set(picked), [picked]);
  const full = picked.length >= BATCH_LIMIT;
  // шторка раскрыта на всю высоту, когда есть недавние (заметка C2 · поездка по дням)
  const hasRecent = !!recent?.length;
  useEffect(() => onFull(hasRecent), [hasRecent]); // eslint-disable-line react-hooks/exhaustive-deps

  // место дня — по первому снимку дня с координатами, по одному запросу за раз
  useEffect(() => {
    let off = false;
    (async () => {
      for (const d of days) {
        const r = d.items.find((x) => x.lat != null && x.lng != null);
        if (!r || off) continue;
        const a = await reverseAddress(r.lat!, r.lng!).catch(() => null);
        const name = a?.place;
        if (!off && name) setDayPlace((m) => ({ ...m, [d.key]: name }));
      }
    })();
    return () => {
      off = true;
    };
  }, [days]);

  const go = (d: Draft, extras: DraftExtras | null = null) => {
    setDraft(d);
    setDraftExtras(extras);
    router.replace('/add');
  };
  const goBatch = (items: BatchItem[]) => {
    setBatch(items);
    router.replace('/batch');
  };

  const camera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return Alert.alert('Нужен доступ к камере', 'Разрешите его в настройках телефона.');
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], exif: true, quality: 1 });
    if (res.canceled || !res.assets?.[0]) return;
    // P6: файл для загрузки перекодируем без метаданных (EXIF/GPS не уходят на сервер), место и время берём из EXIF до этого
    setBusy(true);
    try {
      const a = res.assets[0];
      const f = await prepareJpeg(batchFromPicker(a));
      go({ ...draftFromPicker(a, true), ...f });
    } catch {
      Alert.alert('Не удалось открыть снимок', 'Попробуйте сделать снимок ещё раз.');
    } finally {
      setBusy(false);
    }
  };

  // «Из галереи» и «Снимки из прошлого»: системный выбор, до 50. Один снимок — как раньше, в C3; несколько — в C2b
  const gallery = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      exif: true,
      allowsMultipleSelection: true,
      selectionLimit: BATCH_LIMIT,
      orderedSelection: true,
    });
    if (res.canceled || !res.assets?.length) return;
    if (res.assets.length > 1) return goBatch(res.assets.map(batchFromPicker));
    setBusy(true);
    try {
      const a = res.assets[0];
      const f = await prepareJpeg(batchFromPicker(a));
      go({ ...draftFromPicker(a, false), ...f });
    } catch {
      Alert.alert('Не удалось открыть снимок', 'Попробуйте выбрать другой.');
    } finally {
      setBusy(false);
    }
  };

  // Один недавний снимок — в C3: место и время — из фототеки, сам файл — в JPEG для загрузки
  const pickRecent = async (r: Recent) => {
    setBusy(true);
    try {
      const f = await prepareJpeg(batchFromAsset(r.asset, r.lat, r.lng, r.time));
      go({ ...f, lat: r.lat, lng: r.lng, locationSource: 'exif', takenAt: r.time ? new Date(r.time) : null, timeSource: 'snapshot' });
    } catch {
      Alert.alert('Не удалось открыть снимок', 'Попробуйте выбрать его через «Из галереи».');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (r: Recent) => {
    if (sel.has(r.uri)) return setPicked((p) => p.filter((k) => k !== r.uri));
    if (full) return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    Haptics.selectionAsync().catch(() => {});
    setPicked((p) => [...p, r.uri]);
  };
  /** добавить к выбору (до 50) или, если всё уже выбрано, снять */
  const toggleMany = (list: Recent[]) => {
    Haptics.selectionAsync().catch(() => {});
    if (list.every((r) => sel.has(r.uri))) return setPicked((p) => p.filter((k) => !list.some((r) => r.uri === k)));
    setPicked((p) => {
      const next = [...p];
      for (const r of list) if (next.length < BATCH_LIMIT && !next.includes(r.uri)) next.push(r.uri);
      return next;
    });
  };
  const allPicked = hasRecent && picked.length >= Math.min(BATCH_LIMIT, recent!.length);

  const add = () => {
    const list = picked.map((k) => recent!.find((r) => r.uri === k)!).filter(Boolean);
    if (list.length === 1) return pickRecent(list[0]);
    goBatch(list.map((r) => batchFromAsset(r.asset, r.lat, r.lng, r.time)));
  };

  const thumbView = (r: Recent, more = 0, onMore?: () => void) => {
    const on = more ? false : sel.has(r.uri);
    const ok = r.lat != null && r.time != null;
    const dup = uploaded.has(libKey(r.asset.id));
    const label = more
      ? `Ещё ${more} ${plural(more, 'снимок', 'снимка', 'снимков')} за этот день`
      : [r.time ? `Снимок ${hhmm(new Date(r.time))}` : 'Снимок без времени', ok ? 'есть место и время' : r.lat == null ? 'нет места' : 'нет времени', dup && 'уже на карте', on ? 'выбран' : null]
          .filter(Boolean)
          .join(', ');
    return (
      <Pressable
        key={r.uri}
        disabled={busy}
        onPress={more ? onMore : () => toggle(r)}
        style={[styles.recent, { width: thumb, height: thumb }, !more && !on && full && { opacity: 0.5 }]}
        accessibilityRole={more ? 'button' : 'checkbox'}
        accessibilityState={more ? undefined : { checked: on }}
        accessibilityLabel={label}
      >
        <Image source={{ uri: r.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
        {more ? (
          <View style={styles.more}>
            <Text style={styles.moreText}>+{more}</Text>
          </View>
        ) : (
          // булавка — в левом нижнем углу, справа сверху — галочка (заметка C2 · мультивыбор)
          // не только цветом (ревью 17.11): есть место и время — булавка, чего-то нет — «!»
          <View style={[styles.geo, { backgroundColor: ok ? D.sun : D.ink60 }]}>
            {ok ? <Icon name="pin" size={12} color={D.white} /> : <Text style={styles.geoMark}>!</Text>}
          </View>
        )}
        {!more && dup && (
          <View style={styles.dup}>
            <Text style={styles.dupText}>на карте</Text>
          </View>
        )}
        {!more && <View style={[styles.check, on ? styles.checkOn : styles.checkOff]}>{on && <Text style={styles.checkMark}>✓</Text>}</View>}
      </Pressable>
    );
  };

  return (
    <View style={hasRecent && { flex: 1 }}>
      <Text style={styles.title}>Новый момент</Text>
      {saved && (
        <Pressable
          onPress={() => go(saved.draft, saved.extras)}
          style={({ pressed }) => [styles.draft, pressed && { opacity: 0.8 }]}
          accessibilityLabel={`Продолжить черновик: ${draftLine(saved)}`}
        >
          <Image source={{ uri: saved.draft.uri }} style={styles.draftImg} contentFit="cover" />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.draftTitle} numberOfLines={1}>Продолжить черновик</Text>
            <Text style={styles.draftSub} numberOfLines={1}>{draftLine(saved)}</Text>
          </View>
          <Icon name="chevR" size={18} color={D.ink60} />
        </Pressable>
      )}
      <View style={[styles.tiles, saved && { marginTop: 12 }]}>
        <Pressable onPress={camera} accessibilityRole="button" accessibilityLabel="Снять сейчас: место и время — сразу" style={({ pressed }) => [styles.tile, { backgroundColor: D.sunBtn }, pressed && { opacity: 0.9 }]}>
          <Icon name="camera" size={30} color={D.white} />
          <View style={styles.tileText}>
            <Text style={[styles.tileTitle, { color: D.white }]}>Снять сейчас</Text>
            <Text style={[styles.tileSub, { color: 'rgba(255,255,255,0.8)' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>место и время — сразу</Text>
          </View>
        </Pressable>
        <Pressable onPress={gallery} disabled={busy} accessibilityRole="button" accessibilityLabel={`Из галереи: до ${BATCH_LIMIT} снимков сразу`} style={({ pressed }) => [styles.tile, { backgroundColor: D.paper }, pressed && { opacity: 0.9 }]}>
          <Icon name="gallery" size={30} color={D.ink} />
          <View style={styles.tileText}>
            <Text style={styles.tileTitle}>Из галереи</Text>
            <Text style={styles.tileSub} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>до {BATCH_LIMIT} снимков сразу</Text>
          </View>
        </Pressable>
      </View>

      {/* «Снимки из прошлого» (утверждено 13.10): тот же системный выбор многих снимков */}
      <Pressable onPress={gallery} disabled={busy} style={({ pressed }) => [styles.past, pressed && { opacity: 0.8 }]} accessibilityRole="button" accessibilityLabel="Снимки из прошлого: сразу много снимков">
        <View style={styles.pastThumbs}>
          {[0, 1].map((i) => {
            const r = recent?.[i];
            return (
              <View key={i} style={[styles.pastThumb, i ? styles.pastThumb2 : styles.pastThumb1]}>
                {r && <Image source={{ uri: r.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />}
              </View>
            );
          })}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.draftTitle} numberOfLines={1}>Снимки из прошлого</Text>
          <Text style={styles.draftSub} numberOfLines={1}>сразу много снимков</Text>
        </View>
        <Icon name="chevR" size={18} color={D.ink60} />
      </Pressable>

      {hasRecent && (
        <Animated.View entering={FadeIn.duration(200)} style={{ flex: 1 }}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>НЕДАВНИЕ СНИМКИ</Text>
            <Pressable onPress={() => (allPicked ? setPicked([]) : toggleMany(recent!))} style={styles.link} accessibilityRole="button" accessibilityLabel={allPicked ? 'Снять выбор со всех' : `Выбрать все, до ${BATCH_LIMIT}`}>
              <Text style={styles.linkText}>{allPicked ? 'Снять выбор' : 'Выбрать все'}</Text>
            </Pressable>
          </View>
          {access === 'limited' && (
            <Pressable onPress={changeAccess} style={styles.accessRow} accessibilityRole="button" accessibilityLabel="Открыт доступ только к части фото. Изменить">
              <Icon name="lock" size={14} color={D.ink60} />
              <Text style={styles.accessText}>
                Доступ только к части фото · <Text style={styles.linkText}>Изменить</Text>
              </Text>
            </Pressable>
          )}
          <View style={{ flex: 1 }}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
              {days.map((d) => {
                const n = d.items.filter((r) => sel.has(r.uri)).length;
                const all = n === d.items.length;
                const expanded = open.has(d.key) || d.items.length <= 4;
                const shown = expanded ? d.items : d.items.slice(0, 4);
                const place = dayPlace[d.key];
                return (
                  <View key={d.key}>
                    <View style={styles.dayHead}>
                      <Text style={styles.dayTitle} numberOfLines={1}>
                        {dayTitle(d.date)}
                        {place ? ` · ${place}` : ''}
                        <Text style={styles.dayCount}>{'  '}{all ? `${d.items.length} · все` : n ? `${n} из ${d.items.length}` : d.items.length}</Text>
                      </Text>
                      <Pressable onPress={() => toggleMany(d.items)} style={styles.link} accessibilityRole="button" accessibilityLabel={`${all ? 'Снять выбор' : 'Выбрать всё'} за ${dayTitle(d.date)}`}>
                        <Text style={styles.linkText}>{all ? 'Снять выбор' : 'Выбрать всё за день'}</Text>
                      </Pressable>
                    </View>
                    <View style={styles.recentGrid}>
                      {shown.map((r, i) =>
                        !expanded && i === 3
                          ? thumbView(r, d.items.length - 3, () => setOpen((o) => new Set(o).add(d.key)))
                          : thumbView(r),
                      )}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
            {/* список прокручивается под закреплённым низом */}
            <Svg pointerEvents="none" width={width} height={44} style={styles.fade}>
              <Defs>
                <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={D.white} stopOpacity={0} />
                  <Stop offset="1" stopColor={D.white} stopOpacity={1} />
                </LinearGradient>
              </Defs>
              <Rect width={width} height={44} fill="url(#fade)" />
            </Svg>
          </View>
          {picked.length > 0 && (
            <Animated.View entering={FadeIn.duration(160)} style={styles.bottom}>
              <Text style={styles.counter}>
                Выбрано {picked.length} из {BATCH_LIMIT}
              </Text>
              <Pressable onPress={add} disabled={busy} accessibilityRole="button" accessibilityLabel={`Добавить ${picked.length} ${plural(picked.length, 'снимок', 'снимка', 'снимков')}`} style={({ pressed }) => [styles.cta, pressed && { opacity: 0.88 }]}>
                {busy ? <ActivityIndicator color={D.white} /> : <Text style={styles.ctaText}>Добавить ({picked.length})</Text>}
              </Pressable>
            </Animated.View>
          )}
        </Animated.View>
      )}
      {access === 'denied' && (
        <View style={styles.denied}>
          <Text style={styles.label}>НЕДАВНИЕ СНИМКИ</Text>
          <Pressable onPress={changeAccess} style={({ pressed }) => [styles.deniedRow, pressed && { opacity: 0.8 }]} accessibilityRole="button" accessibilityLabel="Нет доступа к фото. Разрешить в настройках">
            <Icon name="lock" size={18} color={D.ink} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.draftTitle}>Нет доступа к фото</Text>
              <Text style={styles.draftSub}>«Из галереи» работает и без него</Text>
            </View>
            <Text style={styles.linkText}>Разрешить</Text>
          </Pressable>
        </View>
      )}
      {busy && !picked.length && <ActivityIndicator color={D.sun} style={{ marginTop: 12 }} />}
    </View>
  );
}

const styles = StyleSheet.create({
  dim: { flex: 1, backgroundColor: 'rgba(15,14,12,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: D.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    shadowColor: '#17120D',
    shadowOpacity: 0.14,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: -6 },
  },
  grip: { alignSelf: 'center', height: 26, paddingTop: 9 },
  // C1
  avatars: { flexDirection: 'row', marginTop: 14, height: 44 },
  avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 3, borderColor: D.white, backgroundColor: D.paper2 },
  gateTitle: { marginTop: 20, fontFamily: F.serif, fontSize: 30, lineHeight: 36, color: D.ink },
  gateText: { marginTop: 10, fontFamily: F.sans, fontSize: 15, lineHeight: 22, color: D.ink60 },
  later: { alignSelf: 'center', marginTop: 20 },
  laterText: { fontFamily: F.sansSemi, fontSize: 15, color: D.ink60 },
  button: { backgroundColor: D.sunBtn, borderRadius: 999, paddingVertical: 17, alignItems: 'center' },
  buttonText: { fontFamily: F.sansSemi, fontSize: 16, lineHeight: 20, color: D.white },
  // C2
  title: { fontFamily: F.serifItalic, fontSize: 30, lineHeight: 40, color: D.ink },
  tiles: { flexDirection: 'row', gap: 13, marginTop: 16 },
  draft: { marginTop: 16, height: 72, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 12, paddingRight: 14, borderRadius: 20, backgroundColor: D.paper },
  draftImg: { width: 48, height: 48, borderRadius: 10, backgroundColor: D.paper2 },
  draftTitle: { fontFamily: F.sansSemi, fontSize: 15, color: D.ink },
  draftSub: { fontFamily: F.sans, fontSize: 13, color: D.ink60 },
  tile: { flex: 1, height: 140, borderRadius: 22, padding: 18, justifyContent: 'space-between' },
  tileText: { gap: 4 },
  tileTitle: { fontFamily: F.sansSemi, fontSize: 16, lineHeight: 20, color: D.ink },
  tileSub: { fontFamily: F.sans, fontSize: 12, lineHeight: 16, color: D.ink60 },
  // «Снимки из прошлого» (13.10)
  past: { marginTop: 12, height: 72, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 12, paddingRight: 14, borderRadius: 20, backgroundColor: D.paper },
  pastThumbs: { width: 80, height: 54 },
  pastThumb: { position: 'absolute', width: 48, height: 48, borderRadius: 10, overflow: 'hidden', backgroundColor: D.paper2, borderWidth: 2, borderColor: D.white },
  pastThumb1: { left: 0, top: 3, transform: [{ rotate: '-8deg' }] },
  pastThumb2: { left: 30, top: 3, transform: [{ rotate: '6deg' }] },
  // Недавние · мультивыбор по дням (C2 v3, 17.11)
  labelRow: { marginTop: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontFamily: F.mono, fontSize: 11, lineHeight: 15, letterSpacing: 0.88, color: D.ink60 },
  link: { height: 44, justifyContent: 'center', paddingLeft: 8 },
  linkText: { fontFamily: F.sansSemi, fontSize: 13, lineHeight: 16, color: D.ink, textDecorationLine: 'underline' },
  dayHead: { height: 44, marginTop: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayTitle: { flexShrink: 1, fontFamily: F.sansSemi, fontSize: 15, lineHeight: 19, color: D.ink },
  dayCount: { fontFamily: F.sans, fontSize: 13, color: D.ink60 },
  recentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  recent: { borderRadius: 14, overflow: 'hidden', backgroundColor: D.paper2 },
  geo: { position: 'absolute', left: 6, bottom: 6, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  more: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(15,14,12,0.55)', alignItems: 'center', justifyContent: 'center' },
  moreText: { fontFamily: F.sansSemi, fontSize: 17, color: D.paper },
  check: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: D.sunBtn, borderWidth: 2, borderColor: D.white },
  checkOff: { backgroundColor: 'rgba(15,14,12,0.25)', borderWidth: 2, borderColor: D.white },
  checkMark: { fontFamily: F.sansSemi, fontSize: 13, lineHeight: 16, color: D.white },
  fade: { position: 'absolute', left: -24, bottom: 0 },
  geoMark: { fontFamily: F.sansSemi, fontSize: 13, lineHeight: 16, color: D.white },
  dup: { position: 'absolute', right: 6, bottom: 6, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(15,14,12,0.7)' },
  dupText: { fontFamily: F.sansSemi, fontSize: 11, lineHeight: 14, color: D.paper },
  accessRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  accessText: { fontFamily: F.sans, fontSize: 12, color: D.ink60 },
  denied: { marginTop: 24, gap: 11 },
  deniedRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderRadius: 20, backgroundColor: D.paper },
  bottom: { paddingTop: 8 },
  counter: { textAlign: 'center', fontFamily: F.sansSemi, fontSize: 13, lineHeight: 16, color: D.ink },
  cta: { marginTop: 8, height: 54, borderRadius: 27, backgroundColor: D.sunBtn, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontFamily: F.sansSemi, fontSize: 16, color: D.white },
});
