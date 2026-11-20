// C5 · Время вручную — общий для C3 (add.tsx) и C2b (batch.tsx). Вынесено из add.tsx 17.11 без изменений вида
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, View } from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { TimeWheel } from '@/components/time/TimeWheel';
import { SheetGrab } from '@/components/ui/SheetGrab';
import { Text } from '@/components/ui/Text';
import { D, F, SHEET_SPRING } from '@/lib/design';
import type { Draft } from '@/lib/draft';

const WD = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
const MON_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const longDate = (d: Date) => `${WD[d.getDay()]}, ${d.getDate()} ${MON_GEN[d.getMonth()]} ${d.getFullYear()}`;
const SLOT = 15;

/** C5 · Время вручную: дата стрелками, время — колесом по сетке шкалы (15 минут) */
/** onCancel — выйти без изменения времени (QA 17.11: раньше была только «Готово») */
export function TimePicker({ draft, onDone, onCancel }: { draft: Pick<Draft, 'uri' | 'takenAt'>; onDone: (at: Date) => void; onCancel: () => void }) {
  const insets = useSafeAreaInsets();
  // Android «назад» закрывает выбор времени, а не весь экран
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onCancel();
      return true;
    });
    return () => sub.remove();
  }, [onCancel]);
  const base = draft.takenAt ?? new Date();
  const [day, setDay] = useState(() => new Date(base.getFullYear(), base.getMonth(), base.getDate()));
  const [slot, setSlot] = useState(() => Math.floor((base.getHours() * 60 + base.getMinutes()) / SLOT));
  const today = new Date();
  const isToday = day.toDateString() === today.toDateString();
  const shift = (n: number) => setDay((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
  const done = () => {
    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, slot * SLOT);
    onDone(at > today ? new Date(today.getTime() - 60000) : at);
  };
  return (
    <View style={{ flex: 1, backgroundColor: D.night }}>
      <StatusBar style="light" />
      <Image source={{ uri: draft.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(15,14,12,0.5)' }]} />
      <Pressable style={{ flex: 1 }} onPress={onCancel} accessibilityRole="button" accessibilityLabel="Закрыть, не меняя время" />
      <Animated.View
        entering={SlideInDown.springify().damping(SHEET_SPRING.damping).stiffness(SHEET_SPRING.stiffness).mass(SHEET_SPRING.mass)}
        style={[styles.timeSheet, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}
      >
        <View style={styles.grip}>
          <SheetGrab />
        </View>
        <Text style={styles.c5Title}>Когда сделан снимок?</Text>
        {draft.takenAt == null && (
          <View style={styles.noTime}>
            <Icon name="clock" size={16} color={D.sun} />
            <Text style={styles.noTimeText}>В снимке нет времени съёмки</Text>
          </View>
        )}
        <View style={styles.dateRow}>
          <Pressable hitSlop={12} onPress={() => shift(-1)} accessibilityLabel="Предыдущий день">
            <Icon name="chevL" size={20} color={D.ink} />
          </Pressable>
          <Text style={styles.dateText}>{longDate(day)}</Text>
          <Pressable hitSlop={12} disabled={isToday} onPress={() => shift(1)} accessibilityLabel="Следующий день">
            <Icon name="chevR" size={20} color={isToday ? D.line : D.ink} />
          </Pressable>
        </View>
        <Text style={[styles.label, { marginTop: 24 }]}>ВРЕМЯ</Text>
        <View>
          <TimeWheel count={96} initial={slot} slotMin={SLOT} onChange={setSlot} item={43} size={30} band={54} />
        </View>
        <Text style={styles.c5Note}>Если не помните точно — укажите примерно. Совпадения ищем в окне ±15 минут.</Text>
        <Pressable onPress={done} style={({ pressed }) => [styles.button, { marginTop: 32 }, pressed && { opacity: 0.88 }]}>
          <Text style={styles.buttonText}>Готово</Text>
        </Pressable>
        {/* как «Отмена» в C4: 32 pt от кнопки, зона нажатия 46 pt */}
        <Pressable onPress={onCancel} hitSlop={{ left: 16, right: 16 }} style={{ alignSelf: 'center', marginTop: 32 - 13, paddingVertical: 13 }} accessibilityRole="button">
          <Text style={styles.cancel}>Отмена</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  button: { backgroundColor: D.sunBtn, borderRadius: 999, paddingVertical: 17, alignItems: 'center' },
  buttonText: { fontFamily: F.sansSemi, fontSize: 16, lineHeight: 20, color: D.white },
  cancel: { fontFamily: F.sansSemi, fontSize: 15, color: D.ink60 },
  c5Note: { marginTop: 16, fontFamily: F.sans, fontSize: 13, lineHeight: 19, color: D.ink60 },
  c5Title: { marginTop: 2, fontFamily: F.serif, fontSize: 28, lineHeight: 37, color: D.ink },
  dateRow: {
    marginTop: 21,
    height: 56,
    borderRadius: 16,
    backgroundColor: D.paper,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateText: { fontFamily: F.sansSemi, fontSize: 16, color: D.ink },
  grip: { alignSelf: 'center', height: 26, paddingTop: 9 },
  label: { fontFamily: F.mono, fontSize: 11, lineHeight: 15, letterSpacing: 0.88, color: D.ink60 },
  noTime: {
    marginTop: 13,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 12,
    paddingRight: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: D.sunSoft,
  },
  noTimeText: { fontFamily: F.sansMedium, fontSize: 13, lineHeight: 17, color: D.sun },
  timeSheet: {
    backgroundColor: D.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    shadowColor: '#17120D',
    shadowOpacity: 0.14,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: -6 },
  },
});
