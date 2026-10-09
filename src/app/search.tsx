// B4 · Поиск места (макет B4 + утверждённое 09.10: пустое поле, выход «Отмена», смахивание вниз)
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { D, F } from '@/lib/design';
import { requestMapFocus } from '@/lib/focus';
import { photoSource } from '@/lib/photos';
import { agoDays, loadRecent, popularToday, saveRecent, searchPlaces, thousands, type Place, type Popular, type Recent } from '@/lib/places';

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ lat?: string; lng?: string }>();
  const near = { lat: Number(params.lat ?? 59.9341), lng: Number(params.lng ?? 30.3061) };

  const [q, setQ] = useState('');
  const [places, setPlaces] = useState<Place[]>([]);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [popular, setPopular] = useState<Popular[]>([]);
  const input = useRef<TextInput>(null);

  useEffect(() => {
    loadRecent().then(setRecent);
    popularToday(near).then(setPopular).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Места — по мере ввода, с паузой 250 мс; старый запрос отменяется
  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) {
      setPlaces([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      searchPlaces(text, near, ctrl.signal)
        .then((list) => !ctrl.signal.aborted && setPlaces(list))
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => router.back();
  const go = (p: { name: string; lat: number; lng: number }, at?: Date) => {
    saveRecent({ name: p.name, lat: p.lat, lng: p.lng });
    requestMapFocus({ lat: p.lat, lng: p.lng, at });
    router.back();
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.top}>
        <View style={styles.field}>
          <Icon name="search" size={20} color={D.ink} />
          <TextInput
            ref={input}
            value={q}
            onChangeText={setQ}
            autoFocus
            placeholder="Найти место"
            placeholderTextColor={D.ink60}
            selectionColor={D.sun}
            returnKeyType="search"
            autoCorrect={false}
            style={styles.input}
            onSubmitEditing={() => places[0] && go(places[0])}
          />
          {q.length > 0 && (
            <Pressable hitSlop={10} onPress={() => setQ('')} accessibilityLabel="Очистить">
              <Icon name="close" size={18} color={D.ink60} />
            </Pressable>
          )}
        </View>
        <Pressable hitSlop={10} onPress={close} accessibilityRole="button">
          <Text style={styles.cancel}>Отмена</Text>
        </Pressable>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        // смахивание вниз от верха списка закрывает поиск
        onScrollEndDrag={(e) => e.nativeEvent.contentOffset.y < -70 && close()}
      >
        {places.length > 0 && (
          <Animated.View entering={FadeIn.duration(160)} style={[styles.section, { marginTop: 19 }]}>
            <Text style={styles.label}>МЕСТА</Text>
            {places.map((p) => (
              <Row
                key={p.key}
                icon="pin"
                title={p.name}
                sub={[p.city, p.count != null ? `${thousands(p.count)} фото` : null].filter(Boolean).join(' · ')}
                onPress={() => go(p)}
              />
            ))}
          </Animated.View>
        )}

        {recent.length > 0 && (
          <View style={[styles.section, { marginTop: places.length ? 16 : 19 }]}>
            <Text style={styles.label}>НЕДАВНИЕ</Text>
            {recent.map((r) => (
              <Row key={`${r.name}${r.at}`} icon="clock" title={r.name} sub={agoDays(r.at)} onPress={() => go(r)} />
            ))}
          </View>
        )}

        {popular.length > 0 && (
          <View style={[styles.section, { marginTop: places.length || recent.length ? 16 : 19 }]}>
            <Text style={styles.label}>ПОПУЛЯРНО СЕГОДНЯ</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cardsWrap} contentContainerStyle={styles.cards}>
              {popular.map((p) => (
                <Pressable key={p.name} onPress={() => go(p, new Date(p.takenAt))} style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}>
                  <Image source={photoSource(p.cover)} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
                  <View style={styles.cardShade} />
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {p.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Row({ icon, title, sub, onPress }: { icon: 'pin' | 'clock'; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
      <View style={[styles.ic, icon === 'clock' && { backgroundColor: D.paper2 }]}>
        <Icon name={icon} size={18} color={icon === 'pin' ? D.sun : D.ink60} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {sub ? (
          <Text style={styles.sub} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: D.paper },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 16, paddingRight: 16 },
  field: {
    width: 282,
    flexShrink: 1,
    height: 49,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: D.sun,
    backgroundColor: D.white,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 16,
    paddingRight: 14,
  },
  input: { flex: 1, height: '100%', fontFamily: F.sansMedium, fontSize: 16, color: D.ink, padding: 0 },
  cancel: { fontFamily: F.sansMedium, fontSize: 16, color: D.ink },
  // секции: первая подпись — через 19 под полем, между секциями 32 от последней иконки
  section: { paddingHorizontal: 20 },
  label: { fontFamily: F.mono, fontSize: 11, lineHeight: 15, letterSpacing: 0.88, color: D.ink60, marginBottom: 11 },
  row: { height: 56, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  ic: { width: 40, height: 40, borderRadius: 20, backgroundColor: D.sunSoft, alignItems: 'center', justifyContent: 'center' },
  title: { marginTop: 1, fontFamily: F.sansSemi, fontSize: 16, lineHeight: 20, color: D.ink },
  sub: { marginTop: 2, fontFamily: F.sans, fontSize: 13, lineHeight: 17, color: D.ink60 },
  cardsWrap: { marginHorizontal: -20 },
  cards: { paddingHorizontal: 20, gap: 12 },
  card: { width: 150, height: 196, borderRadius: 18, overflow: 'hidden', backgroundColor: D.paper2 },
  cardShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 90,
    experimental_backgroundImage: 'linear-gradient(180deg, rgba(15,14,12,0) 0%, rgba(15,14,12,0.75) 100%)',
  },
  cardTitle: { position: 'absolute', left: 12, right: 8, bottom: 14, fontFamily: F.sansSemi, fontSize: 14, lineHeight: 18, color: D.white },
});
