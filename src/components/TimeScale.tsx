import { useEffect, useMemo, useRef } from 'react';
import { Animated, FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { colors, shadow } from '@/lib/theme';
import { GRANULARITIES, bubbleLabel, bucketWindow, fullDate, type Granularity } from '@/lib/time';

export const BUCKETS = 400; // сколько интервалов можно пролистать назад
const ITEM = 46; // шаг между пузырьками
const D = 54; // диаметр пузырька
const CENTER = 84; // диаметр выбранного (центрального) круга

type Props = {
  anchor: Date;
  granularity: Granularity;
  index: number; // 0 — самый свежий интервал
  counts: Map<number, number>;
  onIndexChange: (i: number) => void;
  onGranularityChange: (g: Granularity) => void;
};

// Шкала времени из макета: бирюзовые пузырьки, выбранный — крупный в центре.
// Свежие интервалы справа, листаем влево — в прошлое.
export function TimeScale({ anchor, granularity, index, counts, onIndexChange, onGranularityChange }: Props) {
  const { width } = useWindowDimensions();
  const pad = (width - ITEM) / 2;
  const listRef = useRef<FlatList<number>>(null);
  const current = useRef(index);
  const posOf = (i: number) => BUCKETS - 1 - i; // позиция в списке слева направо
  const scrollX = useRef(new Animated.Value(posOf(index) * ITEM)).current;
  const data = useMemo(() => Array.from({ length: BUCKETS }, (_, p) => BUCKETS - 1 - p), []);

  // Внешняя смена интервала (например, «кто ещё был здесь») — прокручиваем шкалу
  useEffect(() => {
    if (index !== current.current) {
      current.current = index;
      listRef.current?.scrollToOffset({ offset: posOf(index) * ITEM, animated: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const settle = (x: number) => {
    const p = Math.min(BUCKETS - 1, Math.max(0, Math.round(x / ITEM)));
    const i = BUCKETS - 1 - p;
    if (i !== current.current) {
      current.current = i;
      onIndexChange(i);
    }
  };

  const win = bucketWindow(anchor, granularity, index);
  const selectedCount = counts.get(win.from.getTime()) ?? 0;
  const showDate = granularity === '15min' || granularity === 'hour';

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.chips}>
        {GRANULARITIES.map((g) => (
          <Pressable
            key={g.key}
            onPress={() => onGranularityChange(g.key)}
            style={[styles.chip, granularity === g.key && styles.chipActive]}
          >
            <Text style={[styles.chipText, granularity === g.key && styles.chipTextActive]}>{g.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.strip}>
        <View style={styles.band} />
        <Animated.FlatList
          ref={listRef}
          data={data}
          horizontal
          keyExtractor={(i) => String(i)}
          getItemLayout={(_, p) => ({ length: ITEM, offset: ITEM * p, index: p })}
          contentContainerStyle={{ paddingHorizontal: pad }}
          showsHorizontalScrollIndicator={false}
          snapToInterval={ITEM}
          decelerationRate="fast"
          initialNumToRender={30}
          windowSize={7}
          onLayout={() => listRef.current?.scrollToOffset({ offset: posOf(current.current) * ITEM, animated: false })}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
          scrollEventThrottle={16}
          onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.x)}
          onScrollEndDrag={(e) => {
            if (Math.abs(e.nativeEvent.velocity?.x ?? 0) < 0.05) settle(e.nativeEvent.contentOffset.x);
          }}
          renderItem={({ item: i }) => {
            const p = posOf(i);
            const scale = scrollX.interpolate({
              inputRange: [-4, -3, -2, -1, 0, 1, 2, 3, 4].map((k) => (p + k) * ITEM),
              outputRange: [0.3, 0.4, 0.55, 0.8, 1, 0.8, 0.55, 0.4, 0.3],
              extrapolate: 'clamp',
            });
            const n = counts.get(bucketWindow(anchor, granularity, i).from.getTime()) ?? 0;
            return (
              <Pressable
                style={styles.item}
                onPress={() => {
                  listRef.current?.scrollToOffset({ offset: p * ITEM, animated: true });
                  settle(p * ITEM);
                }}
              >
                <Animated.View
                  style={[
                    styles.bubble,
                    { transform: [{ scale }], backgroundColor: n > 0 ? colors.tealMid : colors.tealPale },
                  ]}
                />
              </Pressable>
            );
          }}
        />
        <View style={styles.center} pointerEvents="none">
          <Text style={styles.centerTime}>{bubbleLabel(win.from, granularity)}</Text>
          <Text style={styles.centerSub}>
            {selectedCount > 0 ? `${selectedCount} фото` : showDate ? fullDate(win.from) : 'пусто'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  chips: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 6 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.92)',
    ...shadow,
    shadowOpacity: 0.08,
    elevation: 2,
  },
  chipActive: { backgroundColor: colors.teal },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.text },
  chipTextActive: { color: colors.white },
  strip: { height: CENTER + 8, justifyContent: 'center' },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: D + 10,
    backgroundColor: 'rgba(31,170,170,0.18)',
  },
  item: { width: ITEM, height: CENTER, alignItems: 'center', justifyContent: 'center' },
  bubble: { width: D, height: D, borderRadius: D / 2 },
  center: {
    position: 'absolute',
    alignSelf: 'center',
    width: CENTER,
    height: CENTER,
    borderRadius: CENTER / 2,
    backgroundColor: colors.teal,
    borderWidth: 3,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  centerTime: { color: colors.white, fontSize: 17, fontWeight: '700' },
  centerSub: { color: colors.white, fontSize: 10, opacity: 0.9, marginTop: 1 },
});
