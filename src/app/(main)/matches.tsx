// D10 · Все совпадения (утверждено 12.10): «Вы в кадре» и «Возможно, вы». Строка → D2. В D1 — 5 последних и «Все N →»
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { RoundButton } from '@/components/ui/RoundButton';
import { Stagger } from '@/components/ui/Stagger';
import { D, F } from '@/lib/design';
import { photoSource } from '@/lib/photos';
import { cachedMatches, fetchMatches, hm, matchKey, type Match } from '@/lib/profileData';

const MON = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
/** «12 окт, 00:07»; в другой год — «2 авг 2025, 12:41» */
const when = (d: Date) =>
  `${d.getDate()} ${MON[d.getMonth()]}${d.getFullYear() === new Date().getFullYear() ? '' : ` ${d.getFullYear()}`}, ${hm(d)}`;

export default function AllMatches() {
  const insets = useSafeAreaInsets();
  const [list, setList] = useState<Match[]>(() => cachedMatches());

  // при возврате из D2 — свежий список («Это я» / «скрыть» могли поменять его)
  useFocusEffect(
    useCallback(() => {
      fetchMatches().then(setList).catch(() => {});
    }, []),
  );

  const yes = list.filter((m) => m.confirmed);
  const maybe = list.filter((m) => !m.confirmed);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 9, paddingBottom: Math.max(insets.bottom, 16) + 24 }} showsVerticalScrollIndicator={false}>
        <View style={styles.head}>
          <RoundButton icon="back" label="Назад" onPress={() => router.back()} />
          <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
            Совпадения
          </Text>
        </View>
        <Stagger i={0}>
          <Text style={styles.intro}>Снимки других людей рядом с вашими — не дальше 100 м и ±15 минут.</Text>
        </Stagger>
        {yes.length > 0 && (
          <Stagger i={1}>
            <Text style={styles.label}>ВЫ В КАДРЕ · {yes.length}</Text>
            <Group items={yes} />
          </Stagger>
        )}
        {maybe.length > 0 && (
          <Stagger i={yes.length > 0 ? 2 : 1}>
            <Text style={styles.label}>ВОЗМОЖНО, ВЫ · {maybe.length}</Text>
            <Group items={maybe} />
          </Stagger>
        )}
      </ScrollView>
    </View>
  );
}

function Group({ items }: { items: Match[] }) {
  return (
    <View style={styles.card}>
      {items.map((m, i) => {
        const who = m.other_name || m.other_username || 'Автор';
        const sub = [m.place_name, when(new Date(m.other_taken_at))].filter(Boolean).join(' · ');
        return (
          <View key={matchKey(m)}>
            {i > 0 && <View style={styles.sep} />}
            <Pressable
              onPress={() => router.push({ pathname: '/match', params: { key: matchKey(m) } })}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
              accessibilityLabel={`Совпадение: ${who}, ${sub}`}
            >
              <Image source={photoSource(m.other_storage_path)} style={styles.img} contentFit="cover" />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {who}
                  {m.confirmed ? ' ✓' : ''}
                </Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {sub}
                </Text>
              </View>
              <Icon name="chevR" size={18} color={D.ink40} />
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: D.paper },
  head: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingLeft: 16, paddingRight: 24 },
  title: { flex: 1, fontFamily: F.serif, fontSize: 30, color: D.ink },
  intro: { marginTop: 24, paddingHorizontal: 24, fontFamily: F.sans, fontSize: 15, lineHeight: 22, color: D.ink60 },
  label: { marginTop: 28, marginLeft: 24, fontFamily: F.mono, fontSize: 11, letterSpacing: 0.88, color: D.ink60 },
  card: { marginTop: 10, marginHorizontal: 24, backgroundColor: D.white, borderRadius: 20 },
  sep: { height: 1, marginHorizontal: 8, backgroundColor: D.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 16, paddingRight: 14, paddingVertical: 12, minHeight: 64 },
  img: { width: 44, height: 44, borderRadius: 10, backgroundColor: D.paper2 },
  name: { fontFamily: F.sansSemi, fontSize: 15, color: D.ink },
  sub: { fontFamily: F.sans, fontSize: 13, color: D.ink60 },
});
