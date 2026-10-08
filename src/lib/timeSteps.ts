// Шаг шкалы времени на карте (B1 · M2–M5): 15 минут / час / день / неделя.
// Каждый шаг задаёт «диапазон» (сутки, месяц или год) и деление его на столбики.

export type Step = '15m' | 'hour' | 'day' | 'week';
export const STEPS: { key: Step; chip: string; menu: string }[] = [
  { key: '15m', chip: '15 мин', menu: '15 минут' },
  { key: 'hour', chip: 'Час', menu: 'Час' },
  { key: 'day', chip: 'День', menu: 'День' },
  { key: 'week', chip: 'Неделя', menu: 'Неделя' },
];

const MIN = 60000;
const pad = (n: number) => String(n).padStart(2, '0');
const WD = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];
const WD_FULL = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const MON3 = ['ЯНВ', 'ФЕВ', 'МАР', 'АПР', 'МАЯ', 'ИЮН', 'ИЮЛ', 'АВГ', 'СЕН', 'ОКТ', 'НОЯ', 'ДЕК'];
const MON_TICK = ['ЯНВ', 'ФЕВ', 'МАР', 'АПР', 'МАЙ', 'ИЮН', 'ИЮЛ', 'АВГ', 'СЕН', 'ОКТ', 'НОЯ', 'ДЕК'];
const MON_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MON_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MON_NOM = ['ЯНВАРЬ', 'ФЕВРАЛЬ', 'МАРТ', 'АПРЕЛЬ', 'МАЙ', 'ИЮНЬ', 'ИЮЛЬ', 'АВГУСТ', 'СЕНТЯБРЬ', 'ОКТЯБРЬ', 'НОЯБРЬ', 'ДЕКАБРЬ'];

/** Начало диапазона, в котором лежит момент */
export function rangeStart(step: Step, at: Date) {
  if (step === 'day') return new Date(at.getFullYear(), at.getMonth(), 1);
  if (step === 'week') return new Date(at.getFullYear(), 0, 1);
  return new Date(at.getFullYear(), at.getMonth(), at.getDate());
}
/** Начало соседнего диапазона: −1 / +1 сутки, месяц или год */
export function shiftRange(step: Step, start: Date, dir: number) {
  if (step === 'day') return new Date(start.getFullYear(), start.getMonth() + dir, 1);
  if (step === 'week') return new Date(start.getFullYear() + dir, 0, 1);
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + dir);
}
export const rangeEnd = (step: Step, start: Date) => shiftRange(step, start, 1);

export function bucketCount(step: Step, start: Date) {
  if (step === '15m') return 96;
  if (step === 'hour') return 24;
  if (step === 'day') return new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  const days = Math.round((rangeEnd(step, start).getTime() - start.getTime()) / 86400000);
  return Math.ceil(days / 7);
}
export function bucketStart(step: Step, start: Date, i: number) {
  const y = start.getFullYear(), m = start.getMonth(), d = start.getDate();
  if (step === '15m') return new Date(y, m, d, 0, i * 15);
  if (step === 'hour') return new Date(y, m, d, i);
  if (step === 'day') return new Date(y, m, 1 + i);
  return new Date(y, 0, 1 + i * 7);
}
/** Положение момента на шкале в столбиках (дробное) */
export function position(step: Step, start: Date, t: Date) {
  const n = bucketCount(step, start);
  let i: number;
  if (step === '15m') i = (t.getTime() - start.getTime()) / (15 * MIN);
  else if (step === 'hour') i = (t.getTime() - start.getTime()) / (60 * MIN);
  else if (step === 'day') i = (t.getTime() - start.getTime()) / 86400000;
  else i = (t.getTime() - start.getTime()) / (7 * 86400000);
  return Math.min(n, Math.max(-1, i));
}
export function bucketIndex(step: Step, start: Date, t: Date) {
  return Math.min(bucketCount(step, start) - 1, Math.max(0, Math.floor(position(step, start, t))));
}
export const isCurrentRange = (step: Step, start: Date, now = new Date()) => now >= start && now < rangeEnd(step, start);

/** Строка над временем: «ЧТ, 8 ОКТ 2026» / «ОКТЯБРЬ 2026» / «2026» */
export function rangeLabel(step: Step, start: Date) {
  if (step === 'day') return `${MON_NOM[start.getMonth()]} ${start.getFullYear()}`;
  if (step === 'week') return String(start.getFullYear());
  return `${WD[start.getDay()]}, ${start.getDate()} ${MON3[start.getMonth()]} ${start.getFullYear()}`;
}
/** Крупная надпись для дня и недели (15 мин и час — барабан цифр) */
export function bigLabel(step: Step, start: Date, i: number) {
  const a = bucketStart(step, start, i);
  if (step === 'day') return `${a.getDate()} ${MON_GEN[a.getMonth()]}`;
  const b = new Date(bucketStart(step, start, i + 1).getTime() - 86400000);
  const last = b.getFullYear() > a.getFullYear() ? new Date(a.getFullYear(), 11, 31) : b;
  return a.getMonth() === last.getMonth()
    ? `${a.getDate()}–${last.getDate()} ${MON_SHORT[a.getMonth()]}`
    : `${a.getDate()} ${MON_SHORT[a.getMonth()]}–${last.getDate()} ${MON_SHORT[last.getMonth()]}`;
}
/** Подпись справа от времени */
export function untilLabel(step: Step, start: Date, i: number) {
  const b = bucketStart(step, start, i + 1);
  if (step === '15m' || step === 'hour') return `–${pad(b.getHours() === 0 && b.getDate() !== start.getDate() ? 24 : b.getHours())}:${pad(b.getMinutes())}`;
  if (step === 'day') return WD_FULL[bucketStart(step, start, i).getDay()];
  return `${i + 1} неделя`;
}
export const momentSuffix: Record<Step, string> = { '15m': 'в этот момент', hour: 'в этот час', day: 'в этот день', week: 'за неделю' };
export const emptyRangeTitle: Record<Step, string> = {
  '15m': 'В этот день здесь пусто',
  hour: 'В этот день здесь пусто',
  day: 'В этом месяце здесь пусто',
  week: 'В этом году здесь пусто',
};

/** Подписи под шкалой */
export function ticks(step: Step, start: Date): { i: number; label: string }[] {
  const n = bucketCount(step, start);
  const out: { i: number; label: string }[] = [];
  if (step === '15m') for (let i = 0; i <= n; i += 8) out.push({ i, label: `${pad(i / 4)}:00` });
  else if (step === 'hour') for (let i = 0; i <= n; i += 3) out.push({ i, label: `${pad(i)}:00` });
  else if (step === 'day') for (let i = 0; i < n; i += 7) out.push({ i, label: String(i + 1) });
  else
    for (let m = 0; m < 12; m++) {
      const d = new Date(start.getFullYear(), m, 1);
      out.push({ i: Math.floor((d.getTime() - start.getTime()) / (7 * 86400000)), label: MON_TICK[m] });
    }
  return out;
}
/** Время интервала для B2 («в 09:30») */
export const clock = (step: Step, start: Date, i: number) => {
  const a = bucketStart(step, start, i);
  return `${pad(a.getHours())}:${pad(a.getMinutes())}`;
};
