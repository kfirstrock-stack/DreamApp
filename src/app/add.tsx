// C3 · Подтверждение → C4 · Место на карте / C5 · Время вручную → публикация → C6 · Момент на карте
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import MapView, { type Region } from 'react-native-maps';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Icon } from '@/components/Icon';
import { TimeWheel } from '@/components/time/TimeWheel';
import { useAuth } from '@/lib/auth';
import { D, F, SHEET_SPRING } from '@/lib/design';
import { getDraft, setDraft, type Draft } from '@/lib/draft';
import { requestMapFocus } from '@/lib/focus';
import { boundsAround, fetchPhotosV2, uploadPhoto } from '@/lib/photos';
import { reverseAddress } from '@/lib/places';
import type { Photo } from '@/lib/types';

const pad = (n: number) => String(n).padStart(2, '0');
const WD = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
const MON_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MON3 = ['ЯНВ', 'ФЕВ', 'МАР', 'АПР', 'МАЯ', 'ИЮН', 'ИЮЛ', 'АВГ', 'СЕН', 'ОКТ', 'НОЯ', 'ДЕК'];
const longDate = (d: Date) => `${WD[d.getDay()]}, ${d.getDate()} ${MON_GEN[d.getMonth()]} ${d.getFullYear()}`;
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const stampOf = (d: Date) => `${d.getDate()} ${MON3[d.getMonth()]} ${d.getFullYear()} · ${hhmm(d)}`;
const coords = (lat: number, lng: number) => `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}`;
const coordsLng = (lng: number) => `${Math.abs(lng).toFixed(4)}° ${lng >= 0 ? 'E' : 'W'}`;
const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
};
const SLOT = 15;

type View3 = 'confirm' | 'place' | 'time' | 'done';

export default function PublishScreen() {
  const { session } = useAuth();
  const [draft, setD] = useState<Draft | null>(() => getDraft());
  const [place, setPlace] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState<{ at: Date; lat: number; lng: number; people: Photo[] } | null>(null);
  // Нет места → сразу C4, нет времени → C5 (заметка C3)
  const [view, setView] = useState<View3>(() => (!draft ? 'confirm' : draft.lat == null ? 'place' : draft.takenAt == null ? 'time' : 'confirm'));
  const found = useRef(draft ? draft.lat != null && draft.takenAt != null : false); // «Место и время найдены» — только если оба из снимка

  useEffect(() => {
    if (!draft) router.back();
  }, [draft]);
  useEffect(() => {
    if (draft?.lat == null || draft.lng == null) return;
    reverseAddress(draft.lat, draft.lng).then((a) => setPlace(a.place));
  }, [draft?.lat, draft?.lng]);
  if (!draft) return null;

  const update = (patch: Partial<Draft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    setD(next);
  };

  const publish = async () => {
    if (!session) return router.replace('/new');
    if (draft.lat == null || draft.lng == null) return setView('place');
    if (!draft.takenAt) return setView('time');
    setUploading(true);
    try {
      await uploadPhoto(session.user.id, {
        base64: draft.base64,
        mimeType: draft.mimeType,
        width: draft.width,
        height: draft.height,
        takenAt: draft.takenAt,
        lat: draft.lat,
        lng: draft.lng,
        locationSource: draft.locationSource,
        placeName: place,
        caption: caption.trim() || null,
      });
      // C6: сразу считаем, кто ещё снимал здесь ±15 минут
      const t = draft.takenAt.getTime();
      const near = await fetchPhotosV2(boundsAround(draft.lat, draft.lng, 100), new Date(t - 15 * 60000), new Date(t + 15 * 60000), 300).catch(() => []);
      const people = Array.from(new Map(near.filter((p) => p.user_id !== session.user.id).map((p) => [p.user_id, p])).values());
      setDone({ at: draft.takenAt, lat: draft.lat, lng: draft.lng, people });
      setView('done');
    } catch (e: any) {
      Alert.alert('Не получилось опубликовать', e?.message ?? 'Проверьте интернет и попробуйте ещё раз.');
    } finally {
      setUploading(false);
    }
  };

  if (view === 'done' && done) return <Published draft={draft} place={place} done={done} />;
  if (view === 'place')
    return (
      <PlacePicker
        draft={draft}
        noGeo={draft.lat == null}
        onCancel={() => (draft.lat == null ? router.back() : setView('confirm'))}
        onPick={(lat, lng, name) => {
          update({ lat, lng, locationSource: 'manual' });
          if (name) setPlace(name);
          setView(draft.takenAt == null ? 'time' : 'confirm');
        }}
      />
    );
  if (view === 'time')
    return (
      <TimePicker
        draft={draft}
        onDone={(at) => {
          update({ takenAt: at, timeSource: 'manual' });
          setView('confirm');
        }}
      />
    );
  return (
    <Confirm
      draft={draft}
      place={place}
      found={found.current}
      caption={caption}
      setCaption={setCaption}
      uploading={uploading}
      onPlace={() => setView('place')}
      onTime={() => setView('time')}
      onPublish={publish}
    />
  );
}

/** C3 · Подтверждение */
function Confirm(p: {
  draft: Draft;
  place: string | null;
  found: boolean;
  caption: string;
  setCaption: (s: string) => void;
  uploading: boolean;
  onPlace: () => void;
  onTime: () => void;
  onPublish: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { draft } = p;
  const t = draft.takenAt!;
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: D.paper }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 9, paddingBottom: insets.bottom + 24, paddingHorizontal: 20 }} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} style={[styles.round, { marginLeft: -4 }]} accessibilityLabel="Закрыть">
          <Icon name="close" size={20} color={D.ink} />
        </Pressable>
        <Text style={styles.c3Title}>Новый момент</Text>
        <View style={styles.preview}>
          <Image source={{ uri: draft.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
          {p.found && (
            <View style={styles.exifChip}>
              <Icon name="sparkle" size={14} color={D.sun} />
              <Text style={styles.exifText}>Место и время найдены</Text>
            </View>
          )}
        </View>
        <Text style={[styles.label, { marginTop: 18 }]}>МЫ НАШЛИ В СНИМКЕ</Text>
        <View style={styles.found}>
          <Pressable onPress={p.onTime} style={styles.foundRow}>
            <View style={styles.ic}>
              <Icon name="calendar" size={18} color={D.sun} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.foundTitle} numberOfLines={1}>
                {longDate(t)}, {hhmm(t)}
              </Text>
              <Text style={styles.foundSub}>{draft.timeSource === 'manual' ? 'указано вручную · можно поправить' : 'из данных снимка · можно поправить'}</Text>
            </View>
            <Icon name="check" size={18} color={D.sun} />
          </Pressable>
          <View style={styles.divider} />
          <Pressable onPress={p.onPlace} style={styles.foundRow}>
            <View style={styles.ic}>
              <Icon name="pin" size={18} color={D.sun} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.foundTitle} numberOfLines={1}>
                {p.place ?? 'Место на карте'}
              </Text>
              <Text style={styles.foundSub}>
                {coords(draft.lat!, draft.lng!)}, {coordsLng(draft.lng!)} · {draft.locationSource === 'manual' ? 'на карте' : 'GPS'}
              </Text>
            </View>
            <Icon name="check" size={18} color={D.sun} />
          </Pressable>
        </View>
        <TextInput
          value={p.caption}
          onChangeText={p.setCaption}
          placeholder="Добавьте подпись…"
          placeholderTextColor={D.ink40}
          selectionColor={D.sun}
          style={styles.caption}
          maxLength={500}
          multiline
        />
        <Pressable onPress={p.onPublish} disabled={p.uploading} style={({ pressed }) => [styles.button, { marginTop: 22 }, pressed && { opacity: 0.88 }]}>
          {p.uploading ? <ActivityIndicator color={D.white} /> : <Text style={styles.buttonText}>Опубликовать момент</Text>}
        </Pressable>
        <Text style={styles.footnote}>Снимок увидят все, кто откроет это место и время на карте</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** C4 · Место на карте: карта двигается под булавкой, адрес — обратным геокодированием */
function PlacePicker({ draft, noGeo, onCancel, onPick }: { draft: Draft; noGeo: boolean; onCancel: () => void; onPick: (lat: number, lng: number, name: string | null) => void }) {
  const insets = useSafeAreaInsets();
  const map = useRef<MapView>(null);
  const start: Region = { latitude: draft.lat ?? 59.9341, longitude: draft.lng ?? 30.3061, latitudeDelta: 0.006, longitudeDelta: 0.006 };
  const [at, setAt] = useState({ lat: start.latitude, lng: start.longitude });
  const [addr, setAddr] = useState<{ address: string | null; place: string | null }>({ address: null, place: null });
  useEffect(() => {
    let off = false;
    const t = setTimeout(() => reverseAddress(at.lat, at.lng).then((a) => !off && setAddr(a)), 250);
    return () => {
      off = true;
      clearTimeout(t);
    };
  }, [at.lat, at.lng]);
  // без геоданных начинаем с того места, где сейчас телефон
  useEffect(() => {
    if (!noGeo) return;
    Location.getForegroundPermissionsAsync()
      .then((p) => (p.granted ? Location.getLastKnownPositionAsync() : null))
      .then((pos) => pos && map.current?.animateToRegion({ ...start, latitude: pos.coords.latitude, longitude: pos.coords.longitude }, 0))
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const locate = async () => {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    map.current?.animateToRegion({ ...start, latitude: pos.coords.latitude, longitude: pos.coords.longitude }, 500);
  };
  return (
    <View style={{ flex: 1, backgroundColor: D.mapBase }}>
      <StatusBar style="dark" />
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        initialRegion={start}
        mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
        showsPointsOfInterests={false}
        showsUserLocation
        rotateEnabled={false}
        pitchEnabled={false}
        onRegionChangeComplete={(r) => setAt({ lat: r.latitude, lng: r.longitude })}
      />
      {/* булавка над центром карты: острие — в центре */}
      <View pointerEvents="none" style={styles.pinCenter}>
        <View style={styles.pin}>
          <Icon name="pin" size={28} color={D.white} />
        </View>
        <View style={styles.pinStick} />
        <View style={styles.pinShadow} />
      </View>
      <View style={[styles.c4Top, { top: insets.top + 9 }]}>
        <Pressable onPress={onCancel} style={styles.round} accessibilityLabel="Назад">
          <Icon name="back" size={20} color={D.ink} />
        </Pressable>
        <View style={styles.hint}>
          <Text style={styles.hintTitle}>Где сделан снимок?</Text>
          <Text style={styles.hintText}>{noGeo ? 'В снимке нет геоданных — сдвиньте карту' : 'Сдвиньте карту, чтобы уточнить место'}</Text>
        </View>
      </View>
      <View style={[styles.c4Bottom, { bottom: Math.max(insets.bottom, 12) + 28 }]}>
        <Pressable onPress={locate} style={[styles.round, { alignSelf: 'flex-end', marginRight: 4, marginBottom: 20 }]} accessibilityLabel="Где я">
          <Icon name="locate" size={20} color={D.ink} />
        </Pressable>
        <View style={styles.addressCard}>
          <Text style={styles.addrLabel}>АДРЕС</Text>
          <Text style={styles.addrTitle} numberOfLines={1}>
            {addr.address ?? '…'}
          </Text>
          <Text style={styles.addrCoords}>
            {coords(at.lat, at.lng)} · {coordsLng(at.lng)}
          </Text>
          <Pressable onPress={() => onPick(at.lat, at.lng, addr.place)} style={({ pressed }) => [styles.button, { marginTop: 24 }, pressed && { opacity: 0.88 }]}>
            <Text style={styles.buttonText}>Снимок сделан здесь</Text>
          </Pressable>
          <Pressable onPress={onCancel} hitSlop={10} style={{ alignSelf: 'center', marginTop: 18 }}>
            <Text style={styles.cancel}>Отмена</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/** C5 · Время вручную: дата стрелками, время — колесом по сетке шкалы (15 минут) */
function TimePicker({ draft, onDone }: { draft: Draft; onDone: (at: Date) => void }) {
  const insets = useSafeAreaInsets();
  const base = draft.takenAt ?? new Date();
  const [day, setDay] = useState(() => new Date(base.getFullYear(), base.getMonth(), base.getDate()));
  const [slot, setSlot] = useState(() => Math.floor((base.getHours() * 60 + base.getMinutes()) / SLOT));
  const today = new Date();
  const isToday = day.toDateString() === today.toDateString();
  const shift = (n: number) => setDay((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
  const done = () => {
    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, slot * SLOT);
    onDone(at > today ? new Date(today.getTime() - 60000) : at);
  };
  return (
    <View style={{ flex: 1, backgroundColor: D.night }}>
      <StatusBar style="light" />
      <Image source={{ uri: draft.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(15,14,12,0.5)' }]} />
      <View style={{ flex: 1 }} />
      <Animated.View
        entering={SlideInDown.springify().damping(SHEET_SPRING.damping).stiffness(SHEET_SPRING.stiffness).mass(SHEET_SPRING.mass)}
        style={[styles.timeSheet, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}
      >
        <View style={styles.grip}>
          <Svg width={25} height={8}>
            <Path d="M 1.5 1.5 C 8.5 5 16.5 5 23.5 1.5" stroke="rgba(22,19,15,0.28)" strokeWidth={2} strokeLinecap="round" fill="none" />
          </Svg>
        </View>
        <Text style={styles.c5Title}>Когда сделан снимок?</Text>
        {draft.takenAt == null && (
          <View style={styles.noTime}>
            <Icon name="clock" size={16} color={D.sun} />
            <Text style={styles.noTimeText}>В снимке нет времени съёмки</Text>
          </View>
        )}
        <View style={styles.dateRow}>
          <Pressable hitSlop={12} onPress={() => shift(-1)} accessibilityLabel="Предыдущий день">
            <Icon name="chevL" size={20} color={D.ink} />
          </Pressable>
          <Text style={styles.dateText}>{longDate(day)}</Text>
          <Pressable hitSlop={12} disabled={isToday} onPress={() => shift(1)} accessibilityLabel="Следующий день">
            <Icon name="chevR" size={20} color={isToday ? D.line : D.ink} />
          </Pressable>
        </View>
        <Text style={[styles.label, { marginTop: 24 }]}>ВРЕМЯ</Text>
        <View>
          <TimeWheel count={96} initial={slot} slotMin={SLOT} onChange={setSlot} item={43} size={30} band={54} />
        </View>
        <Text style={styles.c5Note}>Если не помните точно — укажите примерно. Совпадения ищем в окне ±15 минут.</Text>
        <Pressable onPress={done} style={({ pressed }) => [styles.button, { marginTop: 32 }, pressed && { opacity: 0.88 }]}>
          <Text style={styles.buttonText}>Готово</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

/** C6 · Момент на карте (и «рядом никого» — утверждено 09.10) */
function Published({ draft, place, done }: { draft: Draft; place: string | null; done: { at: Date; lat: number; lng: number; people: Photo[] } }) {
  const insets = useSafeAreaInsets();
  const n = done.people.length;
  const shortPlace = useMemo(() => (place ?? '').replace(/площадь/i, 'пл.').toUpperCase(), [place]);
  const toMap = () => {
    requestMapFocus({ lat: done.lat, lng: done.lng, at: done.at });
    router.dismissTo('/');
  };
  const seeThem = () => {
    const from = new Date(done.at);
    from.setMinutes(Math.floor(from.getMinutes() / SLOT) * SLOT, 0, 0);
    requestMapFocus({ lat: done.lat, lng: done.lng, at: done.at });
    router.dismissTo('/');
    router.push({ pathname: '/moment', params: { lat: String(done.lat), lng: String(done.lng), radius: '120', from: String(from.getTime()), title: place ?? '' } });
  };
  return (
    <Animated.View entering={FadeIn.duration(250)} style={[styles.c6, { paddingTop: insets.top + 45 }]}>
      <StatusBar style="light" />
      <View style={styles.polaroidWrap}>
        <View style={styles.polaroid}>
          <Image source={{ uri: draft.uri }} style={styles.polaroidImg} contentFit="cover" />
          <Text style={styles.polaroidStamp}>{stampOf(done.at)}</Text>
        </View>
        <View style={styles.pinBadge}>
          <Icon name="pin" size={24} color={D.white} />
        </View>
      </View>
      <Text style={styles.c6Title}>Момент на карте</Text>
      <Text style={styles.c6Meta} numberOfLines={1}>
        {stampOf(done.at)}
        {shortPlace ? ` · ${shortPlace}` : ''}
      </Text>
      {n > 0 && (
        <View style={styles.match}>
          <Icon name="sparkle" size={16} color={D.white} />
          <Text style={styles.matchText}>Найдено 1 совпадение</Text>
        </View>
      )}
      <View style={[styles.who, { marginTop: n > 0 ? 31 : 19 }]}>
        {n > 0 && (
          <View style={styles.whoAvas}>
            {done.people.slice(0, 4).map((p, i) =>
              p.author_avatar ? (
                <Image key={p.user_id} source={{ uri: p.author_avatar }} style={[styles.whoAva, { marginLeft: i ? -10 : 0, zIndex: 10 - i }]} />
              ) : (
                <View key={p.user_id} style={[styles.whoAva, { marginLeft: i ? -10 : 0, zIndex: 10 - i, backgroundColor: D.sun }]} />
              ),
            )}
          </View>
        )}
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={styles.whoTitle} numberOfLines={1}>
            {n > 0 ? `Здесь ${n === 1 ? 'был' : 'были'} ещё ${n} ${plural(n, 'человек', 'человека', 'человек')}` : 'Пока вы здесь один'}
          </Text>
          <Text style={styles.whoSub}>{n > 0 ? '±15 минут от вашего снимка' : '±15 минут больше никто не снимал'}</Text>
        </View>
      </View>
      <Pressable onPress={n > 0 ? seeThem : toMap} style={({ pressed }) => [styles.button, { marginTop: 24, alignSelf: 'stretch' }, pressed && { opacity: 0.88 }]}>
        <Text style={styles.buttonText}>{n > 0 ? 'Посмотреть их фото' : 'Вернуться на карту'}</Text>
      </Pressable>
      {n > 0 && (
        <Pressable onPress={toMap} hitSlop={10} style={{ marginTop: 20 }}>
          <Text style={styles.backText}>Вернуться на карту</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: D.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#17120D',
    shadowOpacity: 0.14,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
  },
  button: { backgroundColor: D.sun, borderRadius: 999, paddingVertical: 17, alignItems: 'center' },
  buttonText: { fontFamily: F.sansSemi, fontSize: 16, lineHeight: 20, color: D.white },
  label: { fontFamily: F.mono, fontSize: 11, lineHeight: 15, letterSpacing: 0.88, color: D.ink60 },
  grip: { alignSelf: 'center', height: 26, paddingTop: 9 },
  // C3
  c3Title: { marginTop: 12, fontFamily: F.serifItalic, fontSize: 31, lineHeight: 40, color: D.ink },
  preview: { marginTop: 12, height: 250, borderRadius: 24, overflow: 'hidden', backgroundColor: D.paper2 },
  exifChip: {
    position: 'absolute',
    left: 12,
    top: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 10,
    paddingRight: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(15,14,12,0.55)',
  },
  exifText: { fontFamily: F.sansMedium, fontSize: 12, color: D.white },
  found: {
    marginTop: 9,
    backgroundColor: D.white,
    borderRadius: 20,
    paddingHorizontal: 16,
    shadowColor: '#17120D',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  foundRow: { height: 72, flexDirection: 'row', alignItems: 'center', gap: 12 },
  ic: { width: 38, height: 38, borderRadius: 19, backgroundColor: D.sunSoft, alignItems: 'center', justifyContent: 'center' },
  foundTitle: { fontFamily: F.sansSemi, fontSize: 15, lineHeight: 19, color: D.ink },
  foundSub: { marginTop: 3, fontFamily: F.sans, fontSize: 12, lineHeight: 15, color: D.ink60 },
  divider: { height: 1, backgroundColor: D.line },
  caption: {
    marginTop: 16,
    minHeight: 56,
    backgroundColor: D.white,
    borderWidth: 1,
    borderColor: D.line,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 17,
    paddingBottom: 17,
    fontFamily: F.sans,
    fontSize: 15,
    color: D.ink,
  },
  footnote: { marginTop: 14, textAlign: 'center', fontFamily: F.sans, fontSize: 12, lineHeight: 17, color: D.ink60 },
  // C4
  pinCenter: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingBottom: 66 },
  pin: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: D.sun,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#17120D',
    shadowOpacity: 0.3,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 8 },
  },
  pinStick: { width: 3, height: 14, marginTop: -2, borderRadius: 1.5, backgroundColor: D.sun },
  pinShadow: { width: 14, height: 14, marginTop: -2, borderRadius: 7, backgroundColor: 'rgba(23,18,13,0.2)' },
  c4Top: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  hint: {
    flex: 1,
    marginTop: -4,
    backgroundColor: D.white,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 13,
    shadowColor: '#17120D',
    shadowOpacity: 0.12,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 6 },
  },
  hintTitle: { fontFamily: F.sansSemi, fontSize: 15, lineHeight: 19, color: D.ink },
  hintText: { marginTop: 5, fontFamily: F.sans, fontSize: 13, lineHeight: 17, color: D.ink60 },
  c4Bottom: { position: 'absolute', left: 12, right: 12 },
  addressCard: {
    backgroundColor: D.white,
    borderRadius: 28,
    padding: 20,
    paddingBottom: 21,
    shadowColor: '#17120D',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
  },
  addrLabel: { fontFamily: F.mono, fontSize: 11, lineHeight: 15, letterSpacing: 0.66, color: D.ink60 },
  addrTitle: { marginTop: 7, fontFamily: F.sansSemi, fontSize: 19, lineHeight: 24, color: D.ink },
  addrCoords: { marginTop: 8, fontFamily: F.mono, fontSize: 12, lineHeight: 16, letterSpacing: 0.72, color: D.ink40 },
  cancel: { fontFamily: F.sansSemi, fontSize: 15, color: D.ink60 },
  // C5
  timeSheet: {
    backgroundColor: D.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    shadowColor: '#17120D',
    shadowOpacity: 0.14,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: -6 },
  },
  c5Title: { marginTop: 2, fontFamily: F.serif, fontSize: 28, lineHeight: 37, color: D.ink },
  noTime: {
    marginTop: 13,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 12,
    paddingRight: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: D.sunSoft,
  },
  noTimeText: { fontFamily: F.sansMedium, fontSize: 13, lineHeight: 17, color: D.sun },
  dateRow: {
    marginTop: 21,
    height: 56,
    borderRadius: 16,
    backgroundColor: D.paper,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateText: { fontFamily: F.sansSemi, fontSize: 16, color: D.ink },
  c5Note: { marginTop: 16, fontFamily: F.sans, fontSize: 13, lineHeight: 19, color: D.ink60 },
  // C6
  c6: { flex: 1, backgroundColor: D.night, alignItems: 'center', paddingHorizontal: 24 },
  polaroidWrap: { width: 245, height: 293, alignItems: 'center', justifyContent: 'center' },
  polaroid: {
    transform: [{ rotate: '4deg' }],
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
  polaroidImg: { width: 210, height: 240, borderRadius: 2, backgroundColor: D.paper2 },
  polaroidStamp: { fontFamily: F.monoRegular, fontSize: 9, letterSpacing: 0.36, color: D.ink60 },
  pinBadge: {
    position: 'absolute',
    right: -14,
    top: -8,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: D.sun,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#17120D',
    shadowOpacity: 0.4,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 6 },
  },
  c6Title: { marginTop: 5, fontFamily: F.serifItalic, fontSize: 36, lineHeight: 48, color: D.paper },
  c6Meta: { marginTop: 6, fontFamily: F.mono, fontSize: 11, lineHeight: 15, letterSpacing: 0.66, color: 'rgba(244,239,230,0.55)' },
  match: {
    marginTop: 19,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 12,
    paddingRight: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: D.sun,
  },
  matchText: { fontFamily: F.sansSemi, fontSize: 13, lineHeight: 17, color: D.white },
  who: { alignSelf: 'stretch', height: 84, borderRadius: 22, backgroundColor: D.night3, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 18 },
  whoAvas: { flexDirection: 'row' },
  whoAva: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: D.night3, backgroundColor: D.night2 },
  whoTitle: { fontFamily: F.sansSemi, fontSize: 15, lineHeight: 19, color: D.paper },
  whoSub: { fontFamily: F.sans, fontSize: 13, lineHeight: 17, color: 'rgba(244,239,230,0.55)' },
  backText: { fontFamily: F.sansSemi, fontSize: 15, color: 'rgba(244,239,230,0.7)' },
});
