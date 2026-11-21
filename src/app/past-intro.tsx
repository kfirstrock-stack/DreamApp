// После A7 «Продолжить»: вступление «Снимки из прошлого» → выбор из галереи (C7).
// Ничего не выбрано заранее, в пакетной загрузке по умолчанию «Только мне».
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { D, F } from '@/lib/design';
import { BATCH_LIMIT, batchFromPicker, setBatch } from '@/lib/batch';
import { leaveAuth } from '@/lib/onboarding';

export default function PastIntro() {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

  const skip = () => leaveAuth();

  const pick = async () => {
    setBusy(true);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        exif: true,
        allowsMultipleSelection: true,
        selectionLimit: BATCH_LIMIT,
        orderedSelection: true,
      });
      if (res.canceled || !res.assets?.length) return;
      setBatch(res.assets.map(batchFromPicker));
      router.replace('/batch');
    } catch {
      Alert.alert('Не удалось открыть снимки', 'Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 53, paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
      <StatusBar style="dark" />
      <Text style={styles.title}>Снимки из прошлого</Text>
      <Text style={styles.body}>
        Добавьте фото, которые уже есть на телефоне. Место и время возьмём из снимка. По умолчанию они будут только для вас — так можно сначала разобраться спокойно.
      </Text>
      <View style={{ flex: 1 }} />
      <Pressable onPress={pick} disabled={busy} style={({ pressed }) => [styles.button, pressed && { opacity: 0.88 }]}>
        {busy ? <ActivityIndicator color={D.white} /> : <Text style={styles.buttonText}>Выбрать снимки</Text>}
      </Pressable>
      <Pressable onPress={skip} disabled={busy} hitSlop={{ left: 16, right: 16 }} style={styles.later}>
        <Text style={styles.laterText}>Позже, к карте</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: D.paper, paddingHorizontal: 32 },
  title: { fontFamily: F.serif, fontSize: 36, lineHeight: 48, color: D.ink },
  body: { marginTop: 12, fontFamily: F.sans, fontSize: 16, lineHeight: 23, color: D.ink60 },
  button: { backgroundColor: D.sunBtn, borderRadius: 999, paddingVertical: 17, alignItems: 'center' },
  buttonText: { fontFamily: F.sansSemi, fontSize: 16, lineHeight: 20, color: D.white },
  later: { alignSelf: 'center', marginTop: 32 - 13, paddingVertical: 13 },
  laterText: { fontFamily: F.sansSemi, fontSize: 15, color: D.ink60 },
});
