// C4 · поиск места снимка (утверждено 12.10): как B4, но только найденные места; выбор — карта C4 переезжает туда
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { D, F } from '@/lib/design';
import { searchPlaces, thousands, type Place } from '@/lib/places';

export function PlaceSearch({ near, onPick, onCancel }: { near: { lat: number; lng: number }; onPick: (p: Place) => void; onCancel: () => void }) {
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const [places, setPlaces] = useState<Place[]>([]);
  const input = useRef<TextInput>(null);

  // по мере ввода, с паузой 250 мс; старый запрос отменяется
  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) return setPlaces([]);
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

  return (
    <Animated.View entering={FadeIn.duration(160)} style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.top}>
        <View style={styles.field}>
          <Icon name="search" size={20} color={D.ink} />
          <TextInput
            ref={input}
            value={q}
            onChangeText={setQ}
            autoFocus
            placeholder="Найти место или адрес"
            placeholderTextColor={D.ink60}
            selectionColor={D.sun}
            returnKeyType="search"
            autoCorrect={false}
            style={styles.input}
            onSubmitEditing={() => places[0] && onPick(places[0])}
          />
          {q.length > 0 && (
            <Pressable hitSlop={10} onPress={() => setQ('')} accessibilityLabel="Очистить">
              <Icon name="close" size={18} color={D.ink60} />
            </Pressable>
          )}
        </View>
        <Pressable hitSlop={10} onPress={onCancel} accessibilityRole="button">
          <Text style={styles.cancel}>Отмена</Text>
        </Pressable>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {places.length > 0 && (
          <Animated.View entering={FadeIn.duration(160)} style={[styles.section, { marginTop: 19 }]}>
            <Text style={styles.label}>МЕСТА</Text>
            {places.map((p) => (
              <Pressable key={p.key} onPress={() => onPick(p)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
                <View style={styles.ic}>
                  <Icon name="pin" size={18} color={D.sun} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title} numberOfLines={1}>{p.name}</Text>
                  <Text style={styles.sub} numberOfLines={1}>
                    {[p.city, p.count != null ? `${thousands(p.count)} фото` : null].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </Pressable>
            ))}
          </Animated.View>
        )}
      </ScrollView>
    </Animated.View>
  );
}

// стили — как у B4 (app/(main)/search.tsx)
const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: D.paper, zIndex: 100 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 16, paddingRight: 16 },
  field: {
    width: 282, flexShrink: 1, height: 49, borderRadius: 999, borderWidth: 1.5, borderColor: D.sun, backgroundColor: D.white,
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 16, paddingRight: 14,
  },
  input: { flex: 1, height: '100%', fontFamily: F.sansMedium, fontSize: 16, color: D.ink, padding: 0 },
  cancel: { fontFamily: F.sansMedium, fontSize: 16, color: D.ink },
  section: { paddingHorizontal: 20 },
  label: { fontFamily: F.mono, fontSize: 11, lineHeight: 15, letterSpacing: 0.88, color: D.ink60, marginBottom: 11 },
  row: { height: 56, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  ic: { width: 40, height: 40, borderRadius: 20, backgroundColor: D.sunSoft, alignItems: 'center', justifyContent: 'center' },
  title: { marginTop: 1, fontFamily: F.sansSemi, fontSize: 16, lineHeight: 20, color: D.ink },
  sub: { marginTop: 2, fontFamily: F.sans, fontSize: 13, lineHeight: 17, color: D.ink60 },
});
