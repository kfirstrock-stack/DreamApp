import { StyleSheet, View } from 'react-native';

// Ручка шторки (утверждено 12.10): всё, что выезжает снизу и уходит, — прямая 36×5 по центру.
// У панелей, которые не уходят, а меняют развёрнутость (шкала на карте, B6 «Фото»), — дуга 5 pt.
export function SheetGrab() {
  return <View style={styles.grab} />;
}

const styles = StyleSheet.create({
  grab: { alignSelf: 'center', width: 36, height: 5, borderRadius: 2.5, backgroundColor: 'rgba(22,19,15,0.15)' },
});
