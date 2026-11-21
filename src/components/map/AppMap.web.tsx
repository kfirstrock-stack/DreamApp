// Заглушка карты для веба: react-native-maps здесь не импортируется.
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from '@/components/ui/Text';
import { D, F } from '@/lib/design';

export type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export type AppMapHandle = {
  animateToRegion: (region: Region, duration?: number) => void;
};

type Props = {
  style?: StyleProp<ViewStyle>;
  initialRegion?: Region;
  mapType?: string;
  customMapStyle?: unknown;
  userInterfaceStyle?: 'light' | 'dark';
  rotateEnabled?: boolean;
  pitchEnabled?: boolean;
  scrollEnabled?: boolean;
  zoomEnabled?: boolean;
  showsUserLocation?: boolean;
  showsMyLocationButton?: boolean;
  showsCompass?: boolean;
  toolbarEnabled?: boolean;
  showsPointsOfInterests?: boolean;
  onRegionChange?: (region: Region) => void;
  onRegionChangeComplete?: (region: Region) => void;
  onTouchStart?: () => void;
  onPanDrag?: () => void;
};

const AppMap = forwardRef<AppMapHandle, Props>(function AppMap({ style, initialRegion, onRegionChange, onRegionChangeComplete }, ref) {
  const region = useRef<Region>(
    initialRegion ?? { latitude: 59.9341, longitude: 30.3061, latitudeDelta: 0.012, longitudeDelta: 0.012 },
  );

  useImperativeHandle(ref, () => ({
    animateToRegion: (next) => {
      region.current = next;
      onRegionChange?.(next);
      onRegionChangeComplete?.(next);
    },
  }));

  return (
    <View style={[styles.root, style]} accessibilityRole="summary">
      <Text style={styles.title}>Карта на вебе пока недоступна</Text>
      <Text style={styles.sub}>Откройте Glimika в Expo Go на телефоне — там карта работает.</Text>
    </View>
  );
});

export default AppMap;

const styles = StyleSheet.create({
  root: {
    backgroundColor: D.mapBase,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontFamily: F.sansMedium,
    fontSize: 16,
    color: D.ink,
    textAlign: 'center',
  },
  sub: {
    marginTop: 8,
    fontFamily: F.sans,
    fontSize: 14,
    lineHeight: 20,
    color: D.ink60,
    textAlign: 'center',
    maxWidth: 280,
  },
});
