import { StyleSheet, View } from 'react-native';

// Ручка шторки (утверждено 12.10): всё, что выезжает снизу и уходит, — прямая 36×5 по центру.
// У панелей, которые не уходят, а меняют развёрнутость (шкала на карте), — дуга 5 pt.
// 13.10: на тёмной шторке (подробности снимка) — светлая прямая.
export function SheetGrab({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  return <View style={[styles.grab, tone === 'dark' && styles.dark]} />;
}

const styles = StyleSheet.create({
  grab: { alignSelf: 'center', width: 36, height: 5, borderRadius: 2.5, backgroundColor: 'rgba(22,19,15,0.15)' },
  dark: { backgroundColor: 'rgba(255,255,255,0.3)' },
});
