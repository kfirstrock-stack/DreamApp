import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { photoSource } from '@/lib/photos';
import { colors, radius, shadow } from '@/lib/theme';
import { dateTime } from '@/lib/time';
import type { Photo } from '@/lib/types';

type Props = {
  photos: Photo[];
  onOpen: (p: Photo) => void;
  topInset: number;
  bottomInset: number;
  empty?: React.ReactNode;
  showMeta?: boolean;
};

// Мозаика из макета: две колонки разной высоты, раскладываем по самой короткой
export function Mosaic({ photos, onOpen, topInset, bottomInset, empty, showMeta = true }: Props) {
  const { width } = useWindowDimensions();
  const gap = 10;
  const colW = (width - gap * 3) / 2;

  const cols: { p: Photo; h: number }[][] = [[], []];
  const heights = [0, 0];
  for (const p of photos) {
    const ratio = p.width && p.height ? p.height / p.width : 1.25;
    const h = Math.min(Math.max(colW * ratio, colW * 0.75), colW * 1.6);
    const c = heights[0] <= heights[1] ? 0 : 1;
    cols[c].push({ p, h });
    heights[c] += h + gap;
  }

  if (photos.length === 0 && empty) return <View style={[styles.emptyWrap, { paddingTop: topInset }]}>{empty}</View>;

  return (
    <ScrollView
      contentContainerStyle={{ paddingTop: topInset, paddingBottom: bottomInset, paddingHorizontal: gap, flexDirection: 'row', gap }}
      showsVerticalScrollIndicator={false}
    >
      {cols.map((col, ci) => (
        <View key={ci} style={{ width: colW, gap }}>
          {col.map(({ p, h }) => (
            <Pressable key={p.id} onPress={() => onOpen(p)} style={[styles.card, { height: h }]}>
              <Image source={photoSource(p.storage_path)} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
              {showMeta && (
                <View style={styles.meta}>
                  <Text style={styles.metaText} numberOfLines={1}>
                    {dateTime(new Date(p.taken_at))}
                  </Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.tealPale, ...shadow },
  meta: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  metaText: { color: colors.white, fontSize: 11, fontWeight: '600' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
