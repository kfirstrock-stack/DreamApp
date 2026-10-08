import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';
import { colors, shadow } from '@/lib/theme';

type Props = { lat: number; lng: number; url: string; count: number; onPress: () => void };

// Круглое превью фото на карте; если в точке несколько снимков — «стопка» со счётчиком
export function PhotoMarker({ lat, lng, url, count, onPress }: Props) {
  const [tracks, setTracks] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setTracks(false), 2500);
    return () => clearTimeout(t);
  }, [url]);

  return (
    <Marker
      coordinate={{ latitude: lat, longitude: lng }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracks}
      onPress={onPress}
    >
      <View style={styles.box}>
        {count > 1 && <View style={[styles.circle, styles.under]} />}
        <View style={styles.circle}>
          <Image
            source={{ uri: url }}
            style={styles.img}
            contentFit="cover"
            cachePolicy="memory-disk"
            onLoad={() => setTimeout(() => setTracks(false), 50)}
          />
        </View>
        {count > 1 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
          </View>
        )}
      </View>
    </Marker>
  );
}

const S = 64;
const styles = StyleSheet.create({
  box: { width: S + 14, height: S + 14, alignItems: 'center', justifyContent: 'center' },
  circle: {
    width: S,
    height: S,
    borderRadius: S / 2,
    borderWidth: 4,
    borderColor: colors.white,
    backgroundColor: colors.tealPale,
    overflow: 'hidden',
    ...shadow,
  },
  under: { position: 'absolute', transform: [{ translateX: 5 }, { translateY: -4 }], opacity: 0.85 },
  img: { width: '100%', height: '100%' },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 5,
    borderRadius: 12,
    backgroundColor: colors.teal,
    borderWidth: 2,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.white, fontSize: 11, fontWeight: '700' },
});
