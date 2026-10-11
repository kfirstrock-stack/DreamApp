// D9 · Скрытые авторы (утверждено 11.10): список с «Показать» — автор снова появляется на карте и в совпадениях
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RoundButton } from '@/components/ui/RoundButton';
import { Stagger } from '@/components/ui/Stagger';
import { useAuth } from '@/lib/auth';
import { D, F } from '@/lib/design';
import { fetchHiddenAuthors, unhideAuthor, type HiddenAuthor } from '@/lib/profileData';

export default function HiddenAuthors() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const uid = session?.user.id;
  const [list, setList] = useState<HiddenAuthor[] | null>(null);

  useEffect(() => {
    if (uid) fetchHiddenAuthors(uid).then(setList).catch(() => setList([]));
  }, [uid]);

  const show = (a: HiddenAuthor) => {
    if (!uid) return;
    setList((l) => (l ?? []).filter((x) => x.id !== a.id));
    unhideAuthor(uid, a.id).catch(() => {
      setList((l) => [a, ...(l ?? [])]);
      Alert.alert('Не получилось', 'Проверьте интернет и попробуйте ещё раз.');
    });
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 9, paddingBottom: Math.max(insets.bottom, 16) + 24 }}>
        <View style={styles.head}>
          <RoundButton icon="back" label="Назад" onPress={() => router.back()} />
          <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
            Скрытые авторы
          </Text>
        </View>
        <Stagger i={0}>
        <Text style={styles.intro}>
          {list && list.length === 0 ? 'Вы никого не скрывали.' : 'Их фото не появляются у вас на карте и в совпадениях.'}
        </Text>
        </Stagger>
        <Stagger i={1}>
        {list && list.length > 0 && (
          <View style={styles.card}>
            {list.map((a, i) => (
              <Animated.View key={a.id} exiting={FadeOut.duration(160)} layout={LinearTransition}>
                {i > 0 && <View style={styles.sep} />}
                <View style={styles.row}>
                  {a.avatar ? (
                    <Image source={{ uri: a.avatar }} style={styles.ava} />
                  ) : (
                    <View style={[styles.ava, styles.avaEmpty]}>
                      <Text style={styles.avaLetter}>{a.name.charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  <Pressable style={{ flex: 1, gap: 2 }} onPress={() => router.push({ pathname: '/user/[id]', params: { id: a.id } })}>
                    <Text style={styles.name} numberOfLines={1}>
                      {a.name}
                    </Text>
                    {a.username ? <Text style={styles.nick}>@{a.username}</Text> : null}
                  </Pressable>
                  <Pressable onPress={() => show(a)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} style={({ pressed }) => [styles.pill, pressed && { opacity: 0.6 }]}>
                    <Text style={styles.pillText}>Показать</Text>
                  </Pressable>
                </View>
              </Animated.View>
            ))}
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
  ava: { width: 40, height: 40, borderRadius: 20, backgroundColor: D.paper2 },
  avaEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: D.sun },
  avaLetter: { fontFamily: F.sansSemi, fontSize: 16, color: D.white },
  name: { fontFamily: F.sansSemi, fontSize: 15, color: D.ink },
  nick: { fontFamily: F.sans, fontSize: 13, color: D.ink60 },
  pill: { borderWidth: 1.2, borderColor: D.ink, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  pillText: { fontFamily: F.sansSemi, fontSize: 13, color: D.ink },
});
