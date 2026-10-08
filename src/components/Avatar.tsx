import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/lib/theme';

export function Avatar({ name, url, size = 40 }: { name?: string | null; url?: string | null; size?: number }) {
  const s = { width: size, height: size, borderRadius: size / 2 };
  if (url) return <Image source={{ uri: url }} style={[styles.ring, s]} contentFit="cover" />;
  const letter = (name ?? '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <View style={[styles.ring, styles.fallback, s]}>
      <Text style={{ color: colors.white, fontWeight: '700', fontSize: size * 0.42 }}>{letter}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { borderWidth: 2, borderColor: colors.white },
  fallback: { backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center' },
});
