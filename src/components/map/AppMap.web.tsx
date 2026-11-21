// Заглушка карты для веба: react-native-maps здесь не импортируется.
// Текст — компактная плашка сверху, чтобы его не перекрывали пины и кнопки «Где я».
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const insets = useSafeAreaInsets();
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
      {/* Под строкой поиска (~46 + 8), компактно и с непрозрачным фоном — читается поверх пинов */}
      <View style={[styles.banner, { top: insets.top + 62 }]} pointerEvents="none">
        <Text style={styles.title}>Карта на вебе пока недоступна</Text>
        <Text style={styles.sub}>Откройте Glimika в Expo Go на телефоне.</Text>
      </View>
    </View>
  );
});

export default AppMap;

const styles = StyleSheet.create({
  root: {
    backgroundColor: D.mapBase,
  },
  banner: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: 300,
    marginHorizontal: 16,
    backgroundColor: D.paper,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
  },
  title: {
    fontFamily: F.sansMedium,
    fontSize: 13,
    color: D.ink,
    textAlign: 'center',
  },
  sub: {
    marginTop: 2,
    fontFamily: F.sans,
    fontSize: 12,
    lineHeight: 16,
    color: D.ink60,
    textAlign: 'center',
  },
});
