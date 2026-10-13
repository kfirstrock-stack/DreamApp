// Переключатель «Сетка / Лента» (утверждено 13.10): белая пилюля 96×44, сегменты 45×38, выбранный — тёмный
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { Icon } from '@/components/Icon';
import { D } from '@/lib/design';
import type { ViewMode } from '@/lib/feed';

function FeedIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 22 22">
      <Rect x={3} y={2} width={16} height={10} rx={2.5} stroke={color} strokeWidth={1.8} fill="none" />
      <Rect x={3} y={15} width={16} height={3} rx={1.5} stroke={color} strokeWidth={1.8} fill="none" />
    </Svg>
  );
}

export function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  const pick = (m: ViewMode) => {
    if (m === mode) return;
    Haptics.selectionAsync().catch(() => {});
    onChange(m);
  };
  return (
    <View style={styles.wrap} accessibilityRole="tablist">
      {(['grid', 'cards'] as const).map((m) => {
        const on = m === mode;
        const c = on ? D.white : D.ink;
        return (
          <Pressable
            key={m}
            onPress={() => pick(m)}
            hitSlop={{ top: 3, bottom: 3 }} // зона нажатия — вся высота пилюли, 44 pt
            style={[styles.seg, on && styles.segOn]}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={m === 'grid' ? 'Сетка' : 'Лента'}
          >
            {m === 'grid' ? <Icon name="grid" size={22} color={c} /> : <FeedIcon color={c} />}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', padding: 3, borderRadius: 22, backgroundColor: D.white, height: 44 },
  seg: { width: 45, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: D.ink },
});
