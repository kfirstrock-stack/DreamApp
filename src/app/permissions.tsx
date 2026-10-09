// A7 · Разрешения: объясняем до системного окна. «Позже» — приложение работает и без них. Дальше → карта (B1)
import * as Location from 'expo-location';
import { requestPermissionsAsync as requestPhotos, getPermissionsAsync as getPhotos } from 'expo-media-library';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { D, F } from '@/lib/design';
import { markOnboarded } from '@/lib/onboarding';

type Perm = { granted: boolean; canAsk: boolean };

export default function Permissions() {
  const insets = useSafeAreaInsets();
  const [geo, setGeo] = useState<Perm>({ granted: false, canAsk: true });
  const [photo, setPhoto] = useState<Perm>({ granted: false, canAsk: true });

  useEffect(() => {
    Location.getForegroundPermissionsAsync().then((p) => setGeo({ granted: p.granted, canAsk: p.canAskAgain }));
    getPhotos().then((p) => setPhoto({ granted: p.granted, canAsk: p.canAskAgain })).catch(() => {});
  }, []);

  const askGeo = async () => {
    if (!geo.canAsk) return Linking.openSettings();
    const p = await Location.requestForegroundPermissionsAsync();
    setGeo({ granted: p.granted, canAsk: p.canAskAgain });
  };
  const askPhoto = async () => {
    if (!photo.canAsk) return Linking.openSettings();
    const p = await requestPhotos();
    setPhoto({ granted: p.granted, canAsk: p.canAskAgain });
  };
  const done = async () => {
    await markOnboarded();
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: D.paper }}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 53, paddingHorizontal: 32 }}>
        <Text style={styles.title}>Пара разрешений</Text>
        <Text style={styles.body}>Без них DreamApp работает, но не сможет показать фото рядом и прочитать место из снимка.</Text>
        <Card icon="pin" title="Геопозиция" text="Покажем фото рядом с вами и отметим, где сделан снимок" perm={geo} onAsk={askGeo} style={{ marginTop: 27 }} />
        <Card icon="gallery" title="Фото" text="Возьмём из снимков время и место съёмки — вам не придётся вводить их" perm={photo} onAsk={askPhoto} style={{ marginTop: 18 }} />
        <Text style={styles.note}>Камеру спросим, когда вы впервые сделаете снимок.</Text>
        <View style={{ flex: 1, minHeight: 32 }} />
        <Pressable onPress={done} style={({ pressed }) => [styles.button, pressed && { opacity: 0.88 }]}>
          <Text style={styles.buttonText}>Продолжить</Text>
        </Pressable>
        <Pressable onPress={done} hitSlop={10} style={{ alignSelf: 'center', marginTop: 20, marginBottom: Math.max(insets.bottom + 25, 24) }}>
          <Text style={styles.later}>Позже</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Card({ icon, title, text, perm, onAsk, style }: { icon: 'pin' | 'gallery'; title: string; text: string; perm: Perm; onAsk: () => void; style?: object }) {
  return (
    <View style={[styles.card, style]}>
      <View style={styles.ic}>
        <Icon name={icon} size={22} color={D.sun} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardText}>{text}</Text>
        {perm.granted ? (
          <View style={[styles.pill, styles.pillOn]}>
            <Icon name="check" size={14} color={D.paper} />
            <Text style={[styles.pillText, { color: D.paper }]}>Разрешено</Text>
          </View>
        ) : (
          <Pressable onPress={onAsk} hitSlop={8} style={({ pressed }) => [styles.pill, styles.pillOff, pressed && { opacity: 0.7 }]}>
            <Text style={styles.pillText}>{perm.canAsk ? 'Разрешить' : 'Открыть настройки'}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: F.serif, fontSize: 36, lineHeight: 48, color: D.ink },
  body: { marginTop: 6, fontFamily: F.sans, fontSize: 16, lineHeight: 23, color: D.ink60 },
  card: {
    flexDirection: 'row',
    gap: 14,
    backgroundColor: D.white,
    borderRadius: 24,
    paddingLeft: 18,
    paddingRight: 20,
    paddingTop: 18,
    paddingBottom: 18,
    shadowColor: '#17120D',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  ic: { width: 44, height: 44, borderRadius: 22, backgroundColor: D.sunSoft, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { marginTop: 4, fontFamily: F.sansSemi, fontSize: 17, lineHeight: 22, color: D.ink },
  cardText: { marginTop: 4, fontFamily: F.sans, fontSize: 14, lineHeight: 20, color: D.ink60 },
  pill: { marginTop: 12, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  pillOn: { backgroundColor: D.ink },
  pillOff: { borderWidth: 1.2, borderColor: D.ink },
  pillText: { fontFamily: F.sansSemi, fontSize: 13, color: D.ink },
  note: { marginTop: 22, fontFamily: F.sans, fontSize: 13, lineHeight: 18, color: D.ink60 },
  button: { backgroundColor: D.sun, borderRadius: 999, paddingVertical: 17, alignItems: 'center' },
  buttonText: { fontFamily: F.sansSemi, fontSize: 16, lineHeight: 20, color: D.white },
  later: { fontFamily: F.sansSemi, fontSize: 15, color: D.ink60 },
});
