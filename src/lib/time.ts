// Шкала времени: шаги, округление и подписи по-русски

export type Granularity = '15min' | 'hour' | 'day' | 'week';

export const GRANULARITIES: { key: Granularity; label: string }[] = [
  { key: '15min', label: '15 мин' },
  { key: 'hour', label: 'Час' },
  { key: 'day', label: 'День' },
  { key: 'week', label: 'Неделя' },
];

const MIN = 60_000;
export const STEP_MS: Record<Granularity, number> = {
  '15min': 15 * MIN,
  hour: 60 * MIN,
  day: 24 * 60 * MIN,
  week: 7 * 24 * 60 * MIN,
};

export const STEP_INTERVAL: Record<Granularity, string> = {
  '15min': '15 minutes',
  hour: '1 hour',
  day: '1 day',
  week: '7 days',
};

/** Начало интервала, в который попадает дата (в часовом поясе телефона) */
export function floorTo(date: Date, g: Granularity): Date {
  const d = new Date(date);
  d.setSeconds(0, 0);
  if (g === '15min') d.setMinutes(Math.floor(d.getMinutes() / 15) * 15);
  if (g === 'hour') d.setMinutes(0);
  if (g === 'day' || g === 'week') d.setHours(0, 0);
  if (g === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // с понедельника
  return d;
}

/** Интервал номер i, считая назад от якоря (0 — текущий) */
export function bucketStart(anchor: Date, g: Granularity, i: number): Date {
  return new Date(anchor.getTime() - i * STEP_MS[g]);
}

export function bucketWindow(anchor: Date, g: Granularity, i: number) {
  const from = bucketStart(anchor, g, i);
  return { from, to: new Date(from.getTime() + STEP_MS[g]) };
}

/** Номер интервала, в который попадает дата */
export function indexFor(anchor: Date, g: Granularity, date: Date): number {
  return Math.max(0, Math.round((anchor.getTime() - floorTo(date, g).getTime()) / STEP_MS[g]));
}

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const pad = (n: number) => String(n).padStart(2, '0');

export const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const dayMonth = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
export const fullDate = (d: Date) => {
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return sameYear ? dayMonth(d) : `${dayMonth(d)} ${d.getFullYear()}`;
};
export const dateTime = (d: Date) => `${fullDate(d)}, ${hhmm(d)}`;

/** Крупная подпись в центре шкалы */
export function bubbleLabel(from: Date, g: Granularity): string {
  if (g === '15min' || g === 'hour') return hhmm(from);
  return dayMonth(from);
}

/** Подробная подпись под шкалой */
export function windowLabel(from: Date, to: Date, g: Granularity): string {
  if (g === '15min' || g === 'hour') return `${fullDate(from)}, ${hhmm(from)}–${hhmm(to)}`;
  if (g === 'day') return fullDate(from);
  const last = new Date(to.getTime() - 1);
  return `${dayMonth(from)} – ${fullDate(last)}`;
}
