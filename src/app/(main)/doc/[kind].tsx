// D7 · Правила сообщества / D8 · Конфиденциальность — экран с текстом в стиле D5
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RoundButton } from '@/components/ui/RoundButton';
import { Stagger } from '@/components/ui/Stagger';
import { D, F } from '@/lib/design';
import { DOCS, type DocKind } from '@/lib/docs';

export default function DocScreen() {
  const { kind } = useLocalSearchParams<{ kind: DocKind }>();
  const insets = useSafeAreaInsets();
  const doc = DOCS[kind] ?? DOCS.rules;
  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 9, paddingBottom: Math.max(insets.bottom, 16) + 24 }}>
        <View style={styles.head}>
          <RoundButton icon="back" label="Назад" onPress={() => router.back()} />
          <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {doc.title}
          </Text>
        </View>
        <Stagger i={0}>
          <Text style={styles.body}>{doc.body}</Text>
        </Stagger>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: D.paper },
  head: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingLeft: 16, paddingRight: 24 },
  title: { flex: 1, fontFamily: F.serif, fontSize: 30, color: D.ink },
  body: { marginTop: 24, paddingHorizontal: 24, fontFamily: F.sans, fontSize: 15, lineHeight: 22, color: D.ink },
});
