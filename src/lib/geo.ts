// Перевод координат в точки экрана для слоя фото поверх карты (Web Mercator).
// Функции — worklet: считаются прямо в анимационном потоке, пока карту двигают.

export type MapRegion = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };

export function mercX(lng: number) {
  'worklet';
  return (lng + 180) / 360;
}

export function mercY(lat: number) {
  'worklet';
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
}

export function project(lat: number, lng: number, r: MapRegion, w: number, h: number) {
  'worklet';
  const west = mercX(r.longitude - r.longitudeDelta / 2);
  const east = mercX(r.longitude + r.longitudeDelta / 2);
  const north = mercY(r.latitude + r.latitudeDelta / 2);
  const south = mercY(r.latitude - r.latitudeDelta / 2);
  return {
    x: ((mercX(lng) - west) / (east - west)) * w,
    y: ((mercY(lat) - north) / (south - north)) * h,
  };
}

/** Область карты как прямоугольник координат, с запасом (factor > 1 — шире видимого) */
export function regionBounds(r: MapRegion, factor = 1) {
  const dLat = (r.latitudeDelta / 2) * factor;
  const dLng = (r.longitudeDelta / 2) * factor;
  return { minLat: r.latitude - dLat, maxLat: r.latitude + dLat, minLng: r.longitude - dLng, maxLng: r.longitude + dLng };
}

/** Примерный радиус видимой области в метрах */
export function regionRadiusM(r: MapRegion) {
  return Math.max(60, (r.latitudeDelta / 2) * 111_320);
}
