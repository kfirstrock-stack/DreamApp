// C2b · Проверка пачки (v3, 17.11): снимки по дням, место и время — из EXIF, одна видимость на всю пачку → C2c
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { PlacePicker } from '@/components/place/PlacePicker';
import { TimePicker } from '@/components/time/TimePicker';
import { SheetGrab } from '@/components/ui/SheetGrab';
import { Text, TextInput } from '@/components/ui/Text';
import { VisibilitySwitch } from '@/components/ui/VisibilitySwitch';
import { useAuth } from '@/lib/auth';
import { BATCH_LIMIT, batchFromPicker, dayTitle, groupByDay, hhmm, plural, startUpload, takeBatch, useUploaded, type BatchItem } from '@/lib/batch';
import { D, F, SHEET_SPRING } from '@/lib/design';
import { reverseAddress, searchPlaces, type Place } from '@/lib/places';

const DAY_ROWS = 2; // строк дня до «+ ещё N за этот день»
const SPB = { lat: 59.9341, lng: 30.3061 };

export default function BatchReview() {
  const { session, profile, ready: authReady } = useAuth();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<BatchItem[]>(() => takeBatch());
  const [priv, setPriv] = useState(true); // ревью 17.11: по умолчанию «Только мне», как на C7
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [placeFor, setPlaceFor] = useState<BatchItem | null>(null); // 280:2
  const [mapFor, setMapFor] = useState<BatchItem | null>(null); // C4
  const [timeFor, setTimeFor] = useState<BatchItem | null>(null); // C5
  const [note, setNote] = useState<string | null>(null); // «2 уже в пачке — пропустили»
  const uploaded = useUploaded();

  useEffect(() => {
    if (!authReady) return;
    if (!session) router.replace('/sign-in');
    else if (!items.length) router.replace('/new');
  }, [authReady, session, items.length]);

  // адреса строк — по одному запросу за раз
  const geocoded = useRef(new Set<string>());
  useEffect(() => {
    let off = false;
    (async () => {
      for (const it of items) {
        if (off) return;
        if (it.lat == null || it.lng == null || it.place || geocoded.current.has(it.key)) continue;
        geocoded.current.add(it.key);
        const a = await reverseAddress(it.lat, it.lng).catch(() => null); // один сбой геокодера не обрывает остальные
        if (!off && a) patch(it.key, { place: a.place, address: a.address });
      }
    })();
    return () => {
      off = true;
    };
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (key: string, p: Partial<BatchItem>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...p } : i)));
  const remove = (keys: string[]) => setItems((list) => list.filter((i) => !keys.includes(i.key)));

  const days = useMemo(() => groupByDay(items, (i) => i.takenAt), [items]);
  const noPlace = items.filter((i) => i.lat == null).length;
  const noTime = items.filter((i) => !i.takenAt).length;
  const dups = items.filter((i) => uploaded.has(i.key)).length;
  const ready = items.length > 0 && !noPlace && !noTime;
  const near = items.find((i) => i.lat != null) ?? null;

  // «+ Ещё снимки»: тот же системный выбор, сколько осталось до 50; повторно выбранные — пропускаем
  const more = async () => {
    const left = BATCH_LIMIT - items.length;
    if (left <= 0) return setNote(`Не больше ${BATCH_LIMIT} снимков за раз`);
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], exif: true, allowsMultipleSelection: true, selectionLimit: left, orderedSelection: true });
    if (res.canceled || !res.assets?.length) return;
    const have = new Set(items.map((i) => i.key));
    const add = res.assets.map(batchFromPicker).filter((i) => !have.has(i.key));
    const skipped = res.assets.length - add.length;
    setNote(skipped ? `${skipped} ${plural(skipped, 'снимок уже', 'снимка уже', 'снимков уже')} в пачке — пропустили` : null);
    setItems((list) => [...list, ...add].slice(0, BATCH_LIMIT));
  };

  const publish = () => {
    if (!session || !ready) return;
    const author = profile ? { username: profile.username, name: profile.display_name, avatar: profile.avatar_url } : null;
    startUpload(session.user.id, items, priv, author); // C2c: дальше — плашка на карте, «Смотреть» перелетит к снимкам
    router.dismissTo('/');
  };

  if (!authReady || !session || !items.length) {
    return <View style={{ flex: 1, backgroundColor: D.paper }} />;
  }

  if (mapFor)
    return (
      <PlacePicker
        draft={{ lat: mapFor.lat, lng: mapFor.lng }}
        noGeo={mapFor.lat == null}
        onCancel={() => setMapFor(null)}
        onPick={(lat, lng, a) => {
          patch(mapFor.key, { lat, lng, locationSource: 'manual', place: a.place, address: a.address });
          setMapFor(null);
        }}
      />
    );
  if (timeFor)
    return (
      <TimePicker
        draft={timeFor}
        onDone={(at) => {
          patch(timeFor.key, { takenAt: at, timeSource: 'manual' });
          setTimeFor(null);
        }}
        onCancel={() => setTimeFor(null)}
      />
    );

  const meta = [
    `${items.length} ${plural(items.length, 'СНИМОК', 'СНИМКА', 'СНИМКОВ')}`,
    days.length > 1 && `${days.length} ${plural(days.length, 'ДЕНЬ', 'ДНЯ', 'ДНЕЙ')}`,
    noPlace > 0 && `${noPlace} БЕЗ МЕСТА`,
    noTime > 0 && `${noTime} БЕЗ ВРЕМЕНИ`,
    dups > 0 && `${dups} УЖЕ НА КАРТЕ`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={{ flex: 1, backgroundColor: D.paper }}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 9, paddingHorizontal: 24, paddingBottom: 24 }}>
        <View style={styles.top}>
          <Pressable onPress={() => router.back()} style={styles.round} accessibilityRole="button" accessibilityLabel="Закрыть, не публиковать">
            <Icon name="close" size={20} color={D.ink} />
          </Pressable>
          <Pressable onPress={more} style={styles.morePill} accessibilityRole="button" accessibilityLabel={`Добавить ещё снимки, можно ещё ${BATCH_LIMIT - items.length}`}>
            <Text style={styles.morePillText}>+ Ещё снимки</Text>
          </Pressable>
        </View>
        <Text style={styles.title}>Проверьте снимки</Text>
        <Text style={styles.meta}>{meta}</Text>
        {note && (
          <Animated.Text entering={FadeIn} exiting={FadeOut} style={styles.note} allowFontScaling={false}>
            {note}
          </Animated.Text>
        )}

        {days.map((d) => {
          const place = d.items.find((i) => i.place)?.place;
          const expanded = open.has(d.key) || d.items.length <= DAY_ROWS + 1;
          // строки, где не хватает места или времени, видны всегда
          const shown = expanded ? d.items : d.items.filter((i, idx) => idx < DAY_ROWS || i.lat == null || !i.takenAt);
          const hidden = d.items.length - shown.length;
          const head = [dayTitle(d.date), place, String(d.items.length)].filter(Boolean).join(' · ').toUpperCase();
          return (
            <View key={d.key}>
              <View style={styles.dayHead}>
                <Text style={styles.dayTitle} numberOfLines={1}>
                  {head}
                </Text>
                <Pressable onPress={() => remove(d.items.map((i) => i.key))} style={styles.link} accessibilityRole="button" accessibilityLabel={`Убрать день: ${dayTitle(d.date)}, ${d.items.length} ${plural(d.items.length, 'снимок', 'снимка', 'снимков')}`}>
                  <Text style={styles.linkText}>Убрать день</Text>
                </Pressable>
              </View>
              <View style={styles.card}>
                {shown.map((it, i) => (
                  <Row
                    key={it.key}
                    it={it}
                    dup={uploaded.has(it.key)}
                    last={i === shown.length - 1}
                    onRemove={() => remove([it.key])}
                    onPlace={() => setPlaceFor(it)}
                    onTime={() => setTimeFor(it)}
                  />
                ))}
              </View>
              {hidden > 0 && (
                <Pressable onPress={() => setOpen((o) => new Set(o).add(d.key))} style={styles.moreRow} accessibilityRole="button" accessibilityLabel={`Показать ещё ${hidden} за этот день`}>
                  <Text style={styles.moreText}>+ ещё {hidden} за этот день</Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        <VisibilitySwitch priv={priv} onChange={setPriv} />
        <Pressable
          onPress={publish}
          disabled={!ready}
          style={({ pressed }) => [styles.cta, !ready && styles.ctaOff, pressed && { opacity: 0.88 }]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready }}
          accessibilityLabel={`Опубликовать ${items.length} ${plural(items.length, 'снимок', 'снимка', 'снимков')}`}
        >
          <Text style={[styles.ctaText, !ready && { color: D.ink60 }]}>Опубликовать {items.length}</Text>
        </Pressable>
        {/* ревью 17.11: пока у снимка нет места (или времени), кнопка неактивна — и объясняем почему */}
        <Text style={[styles.footnote, !ready && { color: D.error }]}>
          {!ready
            ? [noPlace && `Укажите место у ${noPlace} ${plural(noPlace, 'снимка', 'снимков', 'снимков')}`, noTime && `время у ${noTime} ${plural(noTime, 'снимка', 'снимков', 'снимков')}`].filter(Boolean).join(' и ')
            : `Видимость одна для всех ${items.length} ${plural(items.length, 'снимка', 'снимков', 'снимков')}`}
        </Text>
      </View>

      {placeFor && (
        <PlaceSheet
          it={placeFor}
          near={near ? { lat: near.lat!, lng: near.lng! } : SPB}
          onCancel={() => setPlaceFor(null)}
          onPick={(p) => {
            patch(placeFor.key, { lat: p.lat, lng: p.lng, locationSource: 'manual', place: p.name, address: p.name });
            setPlaceFor(null);
          }}
          onMap={() => {
            setMapFor(placeFor);
            setPlaceFor(null);
          }}
        />
      )}
    </View>
  );
}

/** Строка снимка: место и время или «Нет места» / «Нет времени» → «Указать вручную» */
function Row({ it, dup, last, onRemove, onPlace, onTime }: { it: BatchItem; dup: boolean; last: boolean; onRemove: () => void; onPlace: () => void; onTime: () => void }) {
  const missing = it.lat == null ? 'place' : !it.takenAt ? 'time' : null;
  const title = it.address ?? it.place ?? 'Место на карте';
  const time = it.takenAt ? hhmm(it.takenAt) : '';
  const label = missing ? `Снимок ${time}, нет ${missing === 'place' ? 'места' : 'времени'}. Указать вручную` : `${title}, ${time}${dup ? ', уже на карте' : ''}`;
  const body = (
    <>
      <View>
        <Image source={{ uri: it.uri }} style={styles.thumb} contentFit="cover" />
        {missing && <View style={styles.thumbDot} />}
      </View>
      {missing ? (
        <View style={[styles.text, { gap: 6 }]}>
          {/* не только цветом: значок и текст */}
          <View style={styles.badge}>
            <Icon name={missing === 'place' ? 'pin' : 'clock'} size={12} color={D.error} />
            <Text style={styles.badgeText}>{missing === 'place' ? 'Нет места' : 'Нет времени'}</Text>
          </View>
          <View style={styles.manual}>
            <Text style={styles.manualText}>Указать вручную</Text>
            <Icon name="chevR" size={14} color={D.ink} />
          </View>
        </View>
      ) : (
        <View style={[styles.text, { gap: 2 }]}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {title}
          </Text>
          <View style={styles.rowSubLine}>
            <Text style={styles.rowSub}>{time}</Text>
            {dup && (
              <View style={styles.dupBadge}>
                <Icon name="check" size={11} color={D.ink60} />
                <Text style={styles.dupText}>уже на карте</Text>
              </View>
            )}
          </View>
        </View>
      )}
    </>
  );
  return (
    <View style={styles.row}>
      {missing ? (
        <Pressable onPress={missing === 'place' ? onPlace : onTime} style={styles.rowMain} accessibilityRole="button" accessibilityLabel={label}>
          {body}
        </Pressable>
      ) : (
        <View style={styles.rowMain} accessible accessibilityLabel={label}>
          {body}
        </View>
      )}
      <Pressable onPress={onRemove} style={styles.remove} accessibilityRole="button" accessibilityLabel={`Убрать из пачки: ${missing ? `снимок ${time}` : title}`}>
        <Icon name="close" size={20} color={D.ink60} />
      </Pressable>
      {!last && <View style={styles.divider} />}
    </View>
  );
}

/** 280:2 · «Где сделан снимок?»: поиск по названию или «Отметить на карте» (C4) */
function PlaceSheet({ it, near, onPick, onMap, onCancel }: { it: BatchItem; near: { lat: number; lng: number }; onPick: (p: Place) => void; onMap: () => void; onCancel: () => void }) {
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const [places, setPlaces] = useState<Place[]>([]);
  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) return setPlaces([]);
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      searchPlaces(text, near, ctrl.signal)
        .then((list) => !ctrl.signal.aborted && setPlaces(list.slice(0, 4)))
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Animated.View entering={FadeIn.duration(160)} style={styles.dim}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel="Закрыть" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View
          entering={SlideInDown.springify().damping(SHEET_SPRING.damping).stiffness(SHEET_SPRING.stiffness).mass(SHEET_SPRING.mass)}
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
        >
          <View style={styles.grip}>
            <SheetGrab />
          </View>
          <View style={styles.sheetHead}>
            <Image source={{ uri: it.uri }} style={styles.thumb} contentFit="cover" />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.sheetTitle}>Где сделан снимок?</Text>
              <Text style={styles.sheetSub}>В данных снимка места нет — найдите его или отметьте на карте</Text>
            </View>
          </View>
          <View style={styles.field}>
            <Icon name="search" size={18} color={D.ink60} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Найти место или адрес"
              placeholderTextColor={D.ink60}
              selectionColor={D.sun}
              returnKeyType="search"
              autoCorrect={false}
              style={styles.input}
              onSubmitEditing={() => places[0] && onPick(places[0])}
              accessibilityLabel="Найти место или адрес"
            />
          </View>
          <View style={{ paddingTop: 8 }}>
            {places.map((p) => (
              <View key={p.key}>
                <Pressable onPress={() => onPick(p)} style={({ pressed }) => [styles.option, pressed && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel={[p.name, p.city].filter(Boolean).join(', ')}>
                  <View style={styles.optionIc}>
                    <Icon name="pin" size={18} color={D.ink} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{p.name}</Text>
                    {!!p.city && <Text style={styles.rowSub} numberOfLines={1}>{p.city}</Text>}
                  </View>
                </Pressable>
                <View style={styles.optionDivider} />
              </View>
            ))}
            <Pressable onPress={onMap} style={({ pressed }) => [styles.option, pressed && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel="Отметить на карте">
              <View style={styles.optionIc}>
                <Icon name="map" size={18} color={D.ink} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.rowTitle}>Отметить на карте</Text>
                <Text style={styles.rowSub} numberOfLines={1}>передвиньте булавку туда, где снимали</Text>
              </View>
              <Icon name="chevR" size={18} color={D.ink60} />
            </Pressable>
          </View>
          <Pressable onPress={onCancel} style={styles.cancel} accessibilityRole="button">
            <Text style={styles.cancelText}>Отмена</Text>
          </Pressable>
        </Animated.View>
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: -8 },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: D.white, alignItems: 'center', justifyContent: 'center', shadowColor: '#17120D', shadowOpacity: 0.14, shadowRadius: 6, shadowOffset: { width: 0, height: 4 } },
  morePill: { height: 44, borderRadius: 22, paddingHorizontal: 16, backgroundColor: D.white, justifyContent: 'center', shadowColor: '#17120D', shadowOpacity: 0.14, shadowRadius: 6, shadowOffset: { width: 0, height: 4 } },
  morePillText: { fontFamily: F.sansSemi, fontSize: 14, color: D.ink },
  title: { marginTop: 12, fontFamily: F.serifItalic, fontSize: 30, lineHeight: 40, color: D.ink },
  meta: { marginTop: 4, fontFamily: F.monoRegular, fontSize: 11, lineHeight: 15, letterSpacing: 0.66, color: D.ink60 },
  note: { marginTop: 8, fontFamily: F.sans, fontSize: 12, lineHeight: 16, color: D.ink60 },
  dayHead: { marginTop: 8, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  dayTitle: { flexShrink: 1, fontFamily: F.mono, fontSize: 11, lineHeight: 15, letterSpacing: 0.66, color: D.ink60 },
  link: { height: 44, justifyContent: 'center', paddingLeft: 8 },
  linkText: { fontFamily: F.sansSemi, fontSize: 13, lineHeight: 16, color: D.ink, textDecorationLine: 'underline' },
  card: { marginTop: 2, backgroundColor: D.white, borderRadius: 20, overflow: 'hidden' },
  row: { height: 72, flexDirection: 'row', alignItems: 'center' },
  rowMain: { flex: 1, height: 72, flexDirection: 'row', alignItems: 'center', paddingLeft: 12, gap: 12 },
  thumb: { width: 56, height: 56, borderRadius: 12, backgroundColor: D.paper2 },
  thumbDot: { position: 'absolute', right: -4, top: -2, width: 14, height: 14, borderRadius: 7, backgroundColor: D.error, borderWidth: 2, borderColor: D.white },
  text: { flex: 1 },
  rowTitle: { fontFamily: F.sansSemi, fontSize: 15, lineHeight: 19, color: D.ink },
  rowSubLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowSub: { fontFamily: F.sans, fontSize: 13, lineHeight: 17, color: D.ink60 },
  dupBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: D.paper },
  dupText: { fontFamily: F.sansSemi, fontSize: 11, lineHeight: 15, color: D.ink60 },
  badge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: D.errorSoft },
  badgeText: { fontFamily: F.sansSemi, fontSize: 12, lineHeight: 15, color: D.error },
  manual: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  manualText: { fontFamily: F.sansSemi, fontSize: 13, lineHeight: 16, color: D.ink },
  remove: { width: 44, height: 44, marginLeft: 8, marginRight: 8, alignItems: 'center', justifyContent: 'center' },
  divider: { position: 'absolute', left: 80, right: 0, bottom: 0, height: 1, backgroundColor: 'rgba(22,19,15,0.08)' },
  moreRow: { height: 32, justifyContent: 'center' },
  moreText: { fontFamily: F.sans, fontSize: 12, color: D.ink60 },
  bottom: { paddingHorizontal: 24, paddingTop: 18, backgroundColor: D.paper },
  cta: { marginTop: 20, height: 54, borderRadius: 27, backgroundColor: D.sunBtn, alignItems: 'center', justifyContent: 'center' },
  ctaOff: { backgroundColor: D.paper2 },
  ctaText: { fontFamily: F.sansSemi, fontSize: 16, color: D.white },
  footnote: { marginTop: 14, textAlign: 'center', fontFamily: F.sans, fontSize: 12, lineHeight: 16, color: D.ink60 },
  // 280:2
  dim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(15,14,12,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: D.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, minHeight: 522 },
  grip: { alignSelf: 'center', height: 26, paddingTop: 9 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16 },
  sheetTitle: { fontFamily: F.serifItalic, fontSize: 24, lineHeight: 32, color: D.ink },
  sheetSub: { fontFamily: F.sans, fontSize: 13, lineHeight: 17, color: D.ink60 },
  field: { height: 48, borderRadius: 24, backgroundColor: D.paper, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  input: { flex: 1, height: '100%', fontFamily: F.sans, fontSize: 16, color: D.ink, padding: 0 },
  option: { height: 60, flexDirection: 'row', alignItems: 'center', gap: 12 },
  optionIc: { width: 36, height: 36, borderRadius: 18, backgroundColor: D.paper, alignItems: 'center', justifyContent: 'center' },
  optionDivider: { marginLeft: 48, height: 1, backgroundColor: 'rgba(22,19,15,0.08)' },
  cancel: { marginTop: 'auto', height: 44, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontFamily: F.sansSemi, fontSize: 15, color: D.ink60 },
});
