// C4 · Место на карте — общий для C3 (add.tsx) и C2b (batch.tsx). Вынесено из add.tsx 17.11 без изменений вида
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Platform, Pressable, StyleSheet, View } from 'react-native';
import MapView, { type Region } from '@/components/map/AppMap';
import { Icon } from '@/components/Icon';
import { PlaceSearch } from '@/components/place/PlaceSearch';
import { Text } from '@/components/ui/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { D, F } from '@/lib/design';
import type { Draft } from '@/lib/draft';
import { currentPosition, locateAlert, requestCurrentPosition } from '@/lib/location';
import { reverseAddress } from '@/lib/places';

const coords = (lat: number, lng: number) => `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}`;
const coordsLng = (lng: number) => `${Math.abs(lng).toFixed(4)}° ${lng >= 0 ? 'E' : 'W'}`;

/** C4 · Место на карте: карта двигается под булавкой, адрес — обратным геокодированием */
export function PlacePicker({ draft, noGeo, onCancel, onPick }: { draft: Pick<Draft, 'lat' | 'lng'>; noGeo: boolean; onCancel: () => void; onPick: (lat: number, lng: number, a: { address: string | null; place: string | null }) => void }) {
  const insets = useSafeAreaInsets();
  const map = useRef<MapView>(null);
  const start: Region = { latitude: draft.lat ?? 59.9341, longitude: draft.lng ?? 30.3061, latitudeDelta: 0.006, longitudeDelta: 0.006 };
  const [at, setAt] = useState({ lat: start.latitude, lng: start.longitude });
  // адрес помнит, для какой точки он посчитан: пока карту двигают, старый адрес не выдаём за новый
  const [addr, setAddr] = useState<{ address: string | null; place: string | null; lat?: number; lng?: number }>({ address: null, place: null });
  const fresh = addr.lat === at.lat && addr.lng === at.lng;
  const [searching, setSearching] = useState(false); // C4 · поиск по названию (12.10)
  // Android «назад»: закрывает поиск или выбор места, а не весь экран
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (searching) setSearching(false);
      else onCancel();
      return true;
    });
    return () => sub.remove();
  }, [searching, onCancel]);
  useEffect(() => {
    let off = false;
    const t = setTimeout(() => reverseAddress(at.lat, at.lng).then((a) => !off && setAddr({ ...a, lat: at.lat, lng: at.lng })), 250);
    return () => {
      off = true;
      clearTimeout(t);
    };
  }, [at.lat, at.lng]);
  // без геоданных начинаем с того места, где сейчас телефон
  useEffect(() => {
    if (!noGeo) return;
    Location.getForegroundPermissionsAsync()
      .then((p) => (p.granted ? Location.getLastKnownPositionAsync() : null))
      .then((pos) => pos && map.current?.animateToRegion({ ...start, latitude: pos.coords.latitude, longitude: pos.coords.longitude }, 0))
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const locate = async () => {
    const res = await requestCurrentPosition();
    if (res.ok) map.current?.animateToRegion({ ...start, latitude: res.coords.latitude, longitude: res.coords.longitude }, 500);
    else {
      const a = locateAlert(res.reason);
      Alert.alert(a.title, a.message);
    }
  };
  return (
    <View style={{ flex: 1, backgroundColor: D.mapBase }}>
      <StatusBar style="dark" />
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        initialRegion={start}
        mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
        showsPointsOfInterests={false}
        showsUserLocation
        rotateEnabled={false}
        pitchEnabled={false}
        onRegionChangeComplete={(r) => setAt({ lat: r.latitude, lng: r.longitude })}
      />
      {/* булавка над центром карты: острие — в центре */}
      <View pointerEvents="none" style={styles.pinCenter}>
        <View style={styles.pin}>
          <Icon name="pin" size={28} color={D.white} />
        </View>
        <View style={styles.pinStick} />
        <View style={styles.pinShadow} />
      </View>
      <View style={[styles.c4Top, { top: insets.top + 9 }]}>
        <Pressable onPress={onCancel} style={styles.round} accessibilityLabel="Назад">
          <Icon name="back" size={20} color={D.ink} />
        </Pressable>
        <View style={styles.hint}>
          <Text style={styles.hintTitle}>Где сделан снимок?</Text>
          <Text style={styles.hintText}>Найдите по названию или сдвиньте карту</Text>
          <Pressable onPress={() => setSearching(true)} style={({ pressed }) => [styles.c4Search, pressed && { opacity: 0.7 }]} accessibilityLabel="Найти место или адрес">
            <Icon name="search" size={18} color={D.ink60} />
            <Text style={styles.c4SearchText}>Найти место или адрес</Text>
          </Pressable>
        </View>
      </View>
      <View style={[styles.c4Bottom, { bottom: Math.max(insets.bottom, 12) + 28 }]}>
        <Pressable onPress={locate} style={[styles.round, { alignSelf: 'flex-end', marginRight: 4, marginBottom: 20 }]} accessibilityLabel="Где я">
          <Icon name="locate" size={20} color={D.ink} />
        </Pressable>
        <View style={styles.addressCard}>
          <Text style={styles.addrLabel}>АДРЕС</Text>
          <Text style={styles.addrTitle} numberOfLines={1}>
            {fresh ? (addr.address ?? '—') : '…'}
          </Text>
          <Text style={styles.addrCoords}>
            {coords(at.lat, at.lng)} · {coordsLng(at.lng)}
          </Text>
          <Pressable onPress={() => onPick(at.lat, at.lng, fresh ? addr : { address: null, place: null })} style={({ pressed }) => [styles.button, { marginTop: 24 }, pressed && { opacity: 0.88 }]}>
            <Text style={styles.buttonText}>Снимок сделан здесь</Text>
          </Pressable>
          {/* 13.10: 32 pt от кнопки до «Отмены» и зона нажатия 46 pt, не заходящая на кнопку (как на A4) */}
          <Pressable onPress={onCancel} hitSlop={{ left: 16, right: 16 }} style={{ alignSelf: 'center', marginTop: 32 - 13, paddingVertical: 13 }} accessibilityRole="button">
            <Text style={styles.cancel}>Отмена</Text>
          </Pressable>
        </View>
      </View>
      {searching && (
        <PlaceSearch
          near={at}
          onCancel={() => setSearching(false)}
          onPick={(p) => {
            setSearching(false);
            map.current?.animateToRegion({ ...start, latitude: p.lat, longitude: p.lng }, 500);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: D.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#17120D',
    shadowOpacity: 0.14,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
  },
  button: { backgroundColor: D.sunBtn, borderRadius: 999, paddingVertical: 17, alignItems: 'center' },
  buttonText: { fontFamily: F.sansSemi, fontSize: 16, lineHeight: 20, color: D.white },
  pinCenter: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingBottom: 66 },
  pin: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: D.sun,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#17120D',
    shadowOpacity: 0.3,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 8 },
  },
  pinStick: { width: 3, height: 14, marginTop: -2, borderRadius: 1.5, backgroundColor: D.sun },
  pinShadow: { width: 14, height: 14, marginTop: -2, borderRadius: 7, backgroundColor: 'rgba(23,18,13,0.2)' },
  c4Top: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  hint: {
    flex: 1,
    marginTop: -4,
    backgroundColor: D.white,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 13,
    shadowColor: '#17120D',
    shadowOpacity: 0.12,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 6 },
  },
  hintTitle: { fontFamily: F.sansSemi, fontSize: 15, lineHeight: 19, color: D.ink },
  hintText: { marginTop: 5, fontFamily: F.sans, fontSize: 13, lineHeight: 17, color: D.ink60 },
  c4Search: { marginTop: 10, height: 42, borderRadius: 21, backgroundColor: D.paper, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  c4SearchText: { fontFamily: F.sansMedium, fontSize: 15, color: D.ink60 },
  c4Bottom: { position: 'absolute', left: 12, right: 12 },
  addressCard: {
    backgroundColor: D.white,
    borderRadius: 28,
    padding: 20,
    paddingBottom: 21 - 13, // 13 — нижняя часть зоны нажатия «Отмены»
    shadowColor: '#17120D',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
  },
  addrLabel: { fontFamily: F.mono, fontSize: 11, lineHeight: 15, letterSpacing: 0.66, color: D.ink60 },
  addrTitle: { marginTop: 7, fontFamily: F.sansSemi, fontSize: 19, lineHeight: 24, color: D.ink },
  addrCoords: { marginTop: 8, fontFamily: F.mono, fontSize: 12, lineHeight: 16, letterSpacing: 0.72, color: D.ink60 },
  cancel: { fontFamily: F.sansSemi, fontSize: 15, color: D.ink60 },
});
