// «Видно всем / Только мне» (утверждено 13.10): белая пилюля 44 pt, выбранный сегмент — тёмный
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { D, F } from '@/lib/design';

export function VisibilitySwitch({ priv, onChange }: { priv: boolean; onChange: (priv: boolean) => void }) {
  return (
    <View style={styles.wrap} accessibilityRole="tablist">
      {[false, true].map((v) => {
        const on = v === priv;
        return (
          <Pressable
            key={String(v)}
            onPress={() => {
              if (on) return;
              Haptics.selectionAsync().catch(() => {});
              onChange(v);
            }}
            hitSlop={{ top: 3, bottom: 3 }}
            style={[styles.seg, on && styles.segOn]}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.text, on && { color: D.white }]}>{v ? 'Только мне' : 'Видно всем'}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', padding: 3, borderRadius: 22, backgroundColor: D.white, height: 44 },
  seg: { flex: 1, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: D.ink },
  text: { fontFamily: F.sansSemi, fontSize: 14, color: D.ink },
});
