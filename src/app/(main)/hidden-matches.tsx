// D10 · Скрытые совпадения: список с «Вернуть» — совпадение снова появляется в ленте
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RoundButton } from '@/components/ui/RoundButton';
import { Stagger } from '@/components/ui/Stagger';
import { useAuth } from '@/lib/auth';
import { D, F } from '@/lib/design';
import { photoSource } from '@/lib/photos';
import { dayUpper, fetchHiddenMatches, hm, restoreMatch, type Match } from '@/lib/profileData';

export default function HiddenMatches() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const uid = session?.user.id;
  const [list, setList] = useState<Match[] | null>(null);

  useEffect(() => {
    if (uid) fetchHiddenMatches(uid).then(setList).catch(() => setList([]));
  }, [uid]);

  const restore = (m: Match) => {
    if (!uid) return;
    const key = `${m.my_photo_id}:${m.other_photo_id}`;
    setList((l) => (l ?? []).filter((x) => `${x.my_photo_id}:${x.other_photo_id}` !== key));
    restoreMatch(uid, m).catch(() => {
      setList((l) => [m, ...(l ?? [])]);
      Alert.alert('Не получилось', 'Проверьте интернет и попробуйте ещё раз.');
    });
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 9, paddingBottom: Math.max(insets.bottom, 16) + 24 }}>
        <View style={styles.head}>
          <RoundButton icon="back" label="Назад" onPress={() => router.back()} />
          <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
            Скрытые совпадения
          </Text>
        </View>
        <Stagger i={0}>
          <Text style={styles.intro}>
            {list && list.length === 0
              ? 'Вы ничего не скрывали.'
              : 'Эти совпадения скрыты только для вас. Их можно вернуть.'}
          </Text>
        </Stagger>
        <Stagger i={1}>
          {list && list.length > 0 && (
            <View style={styles.card}>
              {list.map((m, i) => {
                const who = m.other_name || m.other_username || 'Автор';
                const key = `${m.my_photo_id}:${m.other_photo_id}`;
                return (
                  <Animated.View key={key} exiting={FadeOut.duration(160)} layout={LinearTransition}>
                    {i > 0 && <View style={styles.sep} />}
                    <View style={styles.row}>
                      <Image source={photoSource(m.other_storage_path)} style={styles.thumb} contentFit="cover" />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={styles.name} numberOfLines={1}>{who}</Text>
                        <Text style={styles.meta} numberOfLines={1}>
                          {m.place_name ? `${m.place_name} · ` : ''}
                          {dayUpper(new Date(m.other_taken_at))} · {hm(new Date(m.other_taken_at))}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => restore(m)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        accessibilityRole="button"
                        accessibilityLabel={`Вернуть совпадение с ${who}`}
                        style={({ pressed }) => [styles.pill, pressed && { opacity: 0.6 }]}
                      >
                        <Text style={styles.pillText}>Вернуть</Text>
                      </Pressable>
                    </View>
                  </Animated.View>
                );
              })}
            </View>
          )}
        </Stagger>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: D.paper },
  head: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingLeft: 16, paddingRight: 24 },
  title: { flex: 1, fontFamily: F.serif, fontSize: 30, color: D.ink },
  intro: { marginTop: 24, paddingHorizontal: 24, fontFamily: F.sans, fontSize: 15, lineHeight: 22, color: D.ink60 },
  card: { marginTop: 16, marginHorizontal: 24, backgroundColor: D.white, borderRadius: 20 },
  sep: { height: 1, marginHorizontal: 8, backgroundColor: D.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 16, paddingRight: 14, paddingVertical: 12 },
  thumb: { width: 44, height: 44, borderRadius: 8, backgroundColor: D.paper2 },
  name: { fontFamily: F.sansSemi, fontSize: 15, color: D.ink },
  meta: { fontFamily: F.sans, fontSize: 13, color: D.ink60 },
  pill: { borderWidth: 1.2, borderColor: D.ink, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, minHeight: 44, justifyContent: 'center' },
  pillText: { fontFamily: F.sansSemi, fontSize: 13, color: D.ink },
});
