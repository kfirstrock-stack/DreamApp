// Достаём место и время съёмки из EXIF.
// iOS отдаёт вложенные словари {GPS} и {Exif}, Android — плоские ключи GPSLatitude, DateTimeOriginal и т.п.

type Exif = Record<string, any>;

export type ExifInfo = {
  lat: number | null;
  lng: number | null;
  takenAt: Date | null;
  /** offset — точное время с часовым поясом; gps — время спутника (UTC); local — пояс неизвестен, взят пояс телефона */
  timeSource: 'offset' | 'gps' | 'local' | null;
};

function rationalToNumber(part: string): number {
  const [a, b] = part.split('/').map(Number);
  return b ? a / b : a;
}

/** 48.85 | "48.85" | "48/1,51/1,2958/100" | [48, 51, 29.58] → градусы */
function toDegrees(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (Array.isArray(v)) {
    const [d = 0, m = 0, s = 0] = v.map(Number);
    return d + m / 60 + s / 3600;
  }
  if (typeof v === 'string') {
    if (v.includes(',') || v.includes('/')) {
      const [d = 0, m = 0, s = 0] = v.split(',').map((p) => rationalToNumber(p.trim()));
      return d + m / 60 + s / 3600;
    }
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** "2023:07:14 14:05:33" → части даты */
function parseExifDate(s: unknown) {
  if (typeof s !== 'string') return null;
  const m = s.match(/^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):?(\d{2})?/);
  if (!m) return null;
  const [, y, mo, d, h, mi, se = '0'] = m;
  return { y: +y, mo: +mo, d: +d, h: +h, mi: +mi, s: +se };
}

function parseGpsTime(v: unknown): [number, number, number] | null {
  if (typeof v === 'string') {
    if (v.includes('/') || v.includes(',')) {
      const p = v.split(',').map((x) => rationalToNumber(x.trim()));
      return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0];
    }
    const p = v.split(':').map(Number);
    if (p.length >= 2 && p.every(Number.isFinite)) return [p[0], p[1], p[2] ?? 0];
  }
  if (Array.isArray(v)) return [Number(v[0]) || 0, Number(v[1]) || 0, Number(v[2]) || 0];
  return null;
}

export function parseExif(exif: Exif | null | undefined): ExifInfo {
  const empty: ExifInfo = { lat: null, lng: null, takenAt: null, timeSource: null };
  if (!exif) return empty;
  const gps = exif['{GPS}'] ?? exif.GPS ?? {};
  const ex = exif['{Exif}'] ?? exif.Exif ?? {};
  const pick = (...vals: unknown[]) => vals.find((v) => v != null && v !== '');

  // Координаты
  let lat = toDegrees(pick(gps.Latitude, exif.GPSLatitude));
  let lng = toDegrees(pick(gps.Longitude, exif.GPSLongitude));
  const latRef = pick(gps.LatitudeRef, exif.GPSLatitudeRef);
  const lngRef = pick(gps.LongitudeRef, exif.GPSLongitudeRef);
  if (lat != null && latRef === 'S') lat = -Math.abs(lat);
  if (lng != null && lngRef === 'W') lng = -Math.abs(lng);
  if (lat === 0 && lng === 0) lat = lng = null; // пустые координаты
  if (lat != null && (lat < -90 || lat > 90)) lat = null;
  if (lng != null && (lng < -180 || lng > 180)) lng = null;

  // Время
  const dto = parseExifDate(pick(ex.DateTimeOriginal, exif.DateTimeOriginal, ex.DateTimeDigitized, exif.DateTime));
  const offset = pick(ex.OffsetTimeOriginal, exif.OffsetTimeOriginal, ex.OffsetTime, exif.OffsetTime);
  let takenAt: Date | null = null;
  let timeSource: ExifInfo['timeSource'] = null;

  if (dto && typeof offset === 'string' && /^[+-]\d{2}:\d{2}$/.test(offset)) {
    const iso = `${dto.y}-${String(dto.mo).padStart(2, '0')}-${String(dto.d).padStart(2, '0')}T${String(dto.h).padStart(2, '0')}:${String(dto.mi).padStart(2, '0')}:${String(dto.s).padStart(2, '0')}${offset}`;
    const d = new Date(iso);
    if (!isNaN(d.getTime())) [takenAt, timeSource] = [d, 'offset'];
  }
  if (!takenAt) {
    const gDate = parseExifDate(`${pick(gps.DateStamp, exif.GPSDateStamp) ?? ''} 00:00:00`);
    const gTime = parseGpsTime(pick(gps.TimeStamp, exif.GPSTimeStamp));
    if (gDate && gTime) {
      const d = new Date(Date.UTC(gDate.y, gDate.mo - 1, gDate.d, gTime[0], gTime[1], Math.floor(gTime[2])));
      if (!isNaN(d.getTime())) [takenAt, timeSource] = [d, 'gps'];
    }
  }
  if (!takenAt && dto) {
    const d = new Date(dto.y, dto.mo - 1, dto.d, dto.h, dto.mi, dto.s);
    if (!isNaN(d.getTime())) [takenAt, timeSource] = [d, 'local'];
  }
  if (takenAt && takenAt.getTime() > Date.now() + 60 * 60_000) [takenAt, timeSource] = [null, null];

  return { lat, lng, takenAt, timeSource };
}
