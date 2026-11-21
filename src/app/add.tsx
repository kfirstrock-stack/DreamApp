// C3 · Подтверждение → C4 · Место на карте / C5 · Время вручную → публикация → C6 · Момент на карте
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '@/components/ui/Text';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VisibilitySwitch } from '@/components/ui/VisibilitySwitch';
import { Icon } from '@/components/Icon';
import { useAuth } from '@/lib/auth';
import { D, F } from '@/lib/design';
import { clearSavedDraft, getDraft, saveDraft, setDraft, takeDraftExtras, type Draft } from '@/lib/draft';
import { requestMapFocus } from '@/lib/focus';
import { boundsAround, fetchPhotosV2, newPublishKey, uploadPhoto, type PublishKey } from '@/lib/photos';
import { reverseAddress } from '@/lib/places';
import type { Photo } from '@/lib/types';
import { PlacePicker } from '@/components/place/PlacePicker';
import { TimePicker } from '@/components/time/TimePicker';

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

type Done = { at: Date; lat: number; lng: number; people: Photo[]; loadingPeople: boolean };
type View3 = 'confirm' | 'place' | 'time' | 'done' | 'error';
// E2 (утверждено 12.10): сеть — со счётчиком попыток, сервер — без; после 3-й попытки — «Сейчас не получается»
type PubError = { kind: 'network' | 'server'; attempt: number; detail?: string };
const MAX_TRIES = 3;
/** Сбой связи (обрыв, нет сети) — в отличие от отказа сервера */
const isNetwork = (e: any) => {
  const m = `${e?.name ?? ''} ${e?.message ?? ''} ${e?.originalError?.message ?? ''}`.toLowerCase();
  return /network|fetch|timed? ?out|offline|connection|internet|abort/.test(m);
};

export default function PublishScreen() {
  const { session, profile, ready } = useAuth();
  const [draft, setD] = useState<Draft | null>(() => getDraft());
  // «Продолжить черновик» (C2): место, адрес и подпись — как были введены
  const [saved] = useState(() => takeDraftExtras());
  const [place, setPlace] = useState<string | null>(saved?.place ?? null); // название места — в базу (группировка, поиск)
  const [address, setAddress] = useState<string | null>(saved?.address ?? null); // адрес с номером дома — в C3, как на карте C4
  const [caption, setCaption] = useState(saved?.caption ?? '');
  const [priv, setPriv] = useState(false); // «Только мне» (13.10)
  const [pubError, setPubError] = useState<PubError | null>(null);
  const pubKey = useRef<PublishKey | null>(null); // один момент на все «Повторить»
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  // Нет места → сразу C4, нет времени → C5 (заметка C3)
  const [view, setView] = useState<View3>(() => (!draft ? 'confirm' : draft.lat == null ? 'place' : draft.takenAt == null ? 'time' : 'confirm'));
  const found = useRef(draft ? draft.lat != null && draft.takenAt != null : false); // «Место и время найдены» — только если оба из снимка

  useEffect(() => {
    if (!ready) return;
    if (!session) router.replace('/sign-in');
    else if (!draft) router.replace('/new');
  }, [ready, session, draft]);
  useEffect(() => {
    if (draft?.lat == null || draft.lng == null) return;
    let off = false;
    reverseAddress(draft.lat, draft.lng).then((a) => {
      if (off) return;
      setPlace(a.place);
      setAddress(a.address);
    }).catch(() => {});
    return () => {
      off = true;
    };
  }, [draft?.lat, draft?.lng]);
  if (!ready || !session || !draft) {
    return <View style={{ flex: 1, backgroundColor: D.paper }} />;
  }

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
      pubKey.current ??= newPublishKey(session.user.id, draft.mimeType);
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
        private: priv,
      }, pubKey.current, {
        // карта покажет снимок сразу, из локального файла (QA 17.11)
        localUri: draft.uri,
        author: profile ? { username: profile.username, name: profile.display_name, avatar: profile.avatar_url } : null,
      });
      clearSavedDraft(); // опубликовано — черновик больше не нужен
      pubKey.current = null;
      setPubError(null);
      const at = draft.takenAt, lat = draft.lat, lng = draft.lng, uid = session.user.id;
      setDone({ at, lat, lng, people: [], loadingPeople: true });
      setView('done');
      // C6: кто ещё снимал здесь ±15 минут — догружаем фоном, экран успеха не ждёт (QA 17.11)
      const t = at.getTime();
      fetchPhotosV2(boundsAround(lat, lng, 100), new Date(t - 15 * 60000), new Date(t + 15 * 60000), 300)
        .catch(() => [] as Photo[])
        .then((near) => {
          const people = Array.from(new Map(near.filter((p) => p.user_id !== uid).map((p) => [p.user_id, p])).values());
          setDone((d) => (d && d.at === at ? { ...d, people, loadingPeople: false } : d));
        });
    } catch (e: any) {
      const kind = isNetwork(e) ? 'network' : 'server';
      setPubError((prev) => ({ kind, attempt: Math.min(MAX_TRIES, (prev?.kind === kind ? prev.attempt : 0) + 1), detail: `${e?.name ?? ''}: ${e?.message ?? String(e)}${e?.code ? ` [${e.code}]` : ''}` }));
      setView('error');
    } finally {
      setUploading(false);
    }
  };

  if (view === 'done' && done) return <Published draft={draft} place={place} address={address} done={done} />;
  if (view === 'error' && pubError)
    return (
      <PublishError
        draft={draft}
        error={pubError}
        busy={uploading}
        onRetry={publish}
        onSave={async () => {
          await saveDraft(draft, { place, address, caption: caption.trim() }).catch(() => {});
          setDraft(null);
          router.back();
        }}
      />
    );
  if (view === 'place')
    return (
      <PlacePicker
        draft={draft}
        noGeo={draft.lat == null}
        // без места в снимке Confirm показать нечего — к выбору фото (C2), а не на карту
        onCancel={() => (draft.lat == null ? router.replace('/new') : setView('confirm'))}
        onPick={(lat, lng, a) => {
          update({ lat, lng, locationSource: 'manual' });
          // 12.10: раньше при быстром нажатии оставался адрес прежней точки («Хоккейная, 39» у Исаакиевского)
          setPlace(a.place);
          setAddress(a.address);
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
        // без времени в снимке Confirm показать нечего — к выбору фото (C2): /new снят с истории, back увёл бы на карту
        onCancel={() => (draft.takenAt == null ? router.replace('/new') : setView('confirm'))}
      />
    );
  return (
    <Confirm
      draft={draft}
      place={place}
      address={address}
      found={found.current && draft.locationSource !== 'manual' && draft.timeSource !== 'manual'}
      caption={caption}
      setCaption={setCaption}
      priv={priv}
      setPriv={setPriv}
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
  address: string | null;
  found: boolean;
  caption: string;
  setCaption: (s: string) => void;
  priv: boolean;
  setPriv: (v: boolean) => void;
  uploading: boolean;
  onPlace: () => void;
  onTime: () => void;
  onPublish: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { draft } = p;
  const t = draft.takenAt;
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
              <Text style={styles.foundTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                {t ? `${longDate(t)}, ${hhmm(t)}` : 'Укажите время'}
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
                {p.address ?? p.place ?? 'Место на карте'}
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
        {/* 13.10 · «Видно всем / Только мне», по умолчанию — всем */}
        <View style={{ marginTop: 16 }}>
          <VisibilitySwitch priv={p.priv} onChange={p.setPriv} />
        </View>
        <Pressable onPress={p.onPublish} disabled={p.uploading} style={({ pressed }) => [styles.button, { marginTop: 20 }, pressed && { opacity: 0.88 }]}>
          {p.uploading ? <ActivityIndicator color={D.white} /> : <Text style={styles.buttonText}>Опубликовать момент</Text>}
        </Pressable>
        <Text style={styles.footnote}>
          {p.priv ? 'Снимок увидите только вы — совпадения всё равно найдём' : 'Снимок увидят все, кто откроет это место и время на карте'}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** C6 · Момент на карте (и «рядом никого» — утверждено 09.10) */
function Published({ draft, place, address, done }: { draft: Draft; place: string | null; address: string | null; done: Done }) {
  const insets = useSafeAreaInsets();
  const n = done.people.length;
  // как в C3: адрес с номером дома («ИСААКИЕВСКАЯ ПЛ., 4»)
  const shortPlace = useMemo(() => (address ?? place ?? '').replace(/площадь/i, 'пл.').toUpperCase(), [address, place]);
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
            {n > 0 ? `Здесь ${n === 1 ? 'был' : 'были'} ещё ${n} ${plural(n, 'человек', 'человека', 'человек')}` : done.loadingPeople ? 'Ищем, кто был рядом…' : 'Пока вы здесь один'}
          </Text>
          <Text style={styles.whoSub}>{n > 0 || done.loadingPeople ? '±15 минут от вашего снимка' : '±15 минут больше никто не снимал'}</Text>
        </View>
      </View>
      {/* оранжевая кнопка — только для просмотра чужих фото; если смотреть нечего, остаётся серая ссылка */}
      {n > 0 && (
        <Pressable onPress={seeThem} style={({ pressed }) => [styles.button, { marginTop: 24, alignSelf: 'stretch' }, pressed && { opacity: 0.88 }]}>
          <Text style={styles.buttonText}>Посмотреть их фото</Text>
        </Pressable>
      )}
      <Pressable onPress={toMap} hitSlop={10} style={{ marginTop: n > 0 ? 20 : 39 }}>
        <Text style={styles.backText}>Вернуться на карту</Text>
      </Pressable>
    </Animated.View>
  );
}

/** E2 · Ошибка публикации: снимок приглушён, карточка с причиной, «Повторить» и «Сохранить черновик» */
function PublishError({ draft, error, busy, onRetry, onSave }: { draft: Draft; error: PubError; busy: boolean; onRetry: () => void; onSave: () => void }) {
  const insets = useSafeAreaInsets();
  const giveUp = error.kind === 'network' && error.attempt >= MAX_TRIES;
  const title = giveUp ? 'Сейчас не получается' : 'Не удалось опубликовать';
  const body =
    error.kind === 'server'
      ? 'Сервер не принял снимок. Попробуйте ещё раз чуть позже — снимок, место и время сохранены.'
      : giveUp
        ? 'Мы трижды пробовали отправить снимок. Сохраните черновик — опубликуете позже из «+».'
        : 'Связь пропала на середине загрузки. Снимок, место и время сохранены — ничего вводить заново не нужно.';
  const line = error.kind === 'server' ? 'ОШИБКА СЕРВЕРА' : `ОШИБКА СЕТИ · ПОПЫТКА ${error.attempt} ИЗ ${MAX_TRIES}`;
  return (
    <View style={[{ flex: 1, backgroundColor: D.paper }, { paddingTop: insets.top + 68, paddingBottom: Math.max(insets.bottom, 16) + 8, paddingHorizontal: 20 }]}>
      <StatusBar style="dark" />
      <Text style={styles.e2Title}>Новый момент</Text>
      <Image source={{ uri: draft.uri }} style={styles.e2Photo} contentFit="cover" />
      <View style={styles.e2Card}>
        <View style={styles.e2Head}>
          <Icon name="alert" size={26} color={D.sun} />
          <Text style={styles.e2CardTitle} numberOfLines={1}>{title}</Text>
        </View>
        <Text style={styles.e2Body}>{body}</Text>
        <Text style={styles.e2Line}>{line}</Text>
        {__DEV__ && error.detail ? <Text style={[styles.e2Line, { marginTop: 6, color: D.sun }]} selectable>{error.detail}</Text> : null}
      </View>
      <View style={{ flex: 1 }} />
      <Pressable onPress={onRetry} disabled={busy} style={({ pressed }) => [styles.button, pressed && { opacity: 0.88 }]}>
        {busy ? <ActivityIndicator color={D.white} /> : <Text style={styles.buttonText}>Повторить</Text>}
      </Pressable>
      {/* 32 pt от кнопки, зона нажатия 45 pt */}
      <Pressable onPress={onSave} disabled={busy} hitSlop={{ left: 16, right: 16 }} style={styles.e2Save}>
        <Text style={styles.e2SaveText}>Сохранить черновик</Text>
      </Pressable>
    </View>
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
  button: { backgroundColor: D.sunBtn, borderRadius: 999, paddingVertical: 17, alignItems: 'center' },
  // E2
  e2Title: { fontFamily: F.serifItalic, fontSize: 31, lineHeight: 41, color: D.ink },
  e2Photo: { marginTop: 11, height: 250, borderRadius: 24, opacity: 0.5, backgroundColor: D.paper2 },
  e2Card: { marginTop: 26, backgroundColor: D.white, borderWidth: 1.5, borderColor: D.sun, borderRadius: 22, paddingHorizontal: 15, paddingTop: 17, paddingBottom: 24 },
  e2Head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  e2CardTitle: { flex: 1, fontFamily: F.sansSemi, fontSize: 17, color: D.ink },
  e2Body: { marginTop: 12, fontFamily: F.sans, fontSize: 14, lineHeight: 20, color: D.ink60 },
  e2Line: { marginTop: 22, fontFamily: F.mono, fontSize: 10, letterSpacing: 0.6, color: D.ink40 },
  e2Save: { alignSelf: 'center', marginTop: 32 - 13, paddingVertical: 13 },
  e2SaveText: { fontFamily: F.sansSemi, fontSize: 15, color: D.ink60 },
  buttonText: { fontFamily: F.sansSemi, fontSize: 16, lineHeight: 20, color: D.white },
  label: { fontFamily: F.mono, fontSize: 11, lineHeight: 15, letterSpacing: 0.88, color: D.ink60 },
  // C3
  c3Title: { marginTop: 12, fontFamily: F.serifItalic, fontSize: 31, lineHeight: 40, color: D.ink },
  preview: { marginTop: 12, height: 200, borderRadius: 24, overflow: 'hidden', backgroundColor: D.paper2 },
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
    backgroundColor: D.sunBtn,
  },
  matchText: { fontFamily: F.sansSemi, fontSize: 13, lineHeight: 17, color: D.white },
  who: { alignSelf: 'stretch', height: 84, borderRadius: 22, backgroundColor: D.night3, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 18 },
  whoAvas: { flexDirection: 'row' },
  whoAva: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: D.night3, backgroundColor: D.night2 },
  whoTitle: { fontFamily: F.sansSemi, fontSize: 15, lineHeight: 19, color: D.paper },
  whoSub: { fontFamily: F.sans, fontSize: 13, lineHeight: 17, color: 'rgba(244,239,230,0.55)' },
  backText: { fontFamily: F.sansSemi, fontSize: 15, color: 'rgba(244,239,230,0.7)' },
});
