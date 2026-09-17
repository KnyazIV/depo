import { ru } from "date-fns/locale";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

/**
 * Работа со временем.
 *
 * Правило одно: в базе и в API всё в UTC, местное время появляется только на
 * границе — при разборе даты из URL и при выводе на экран. Часовой пояс всегда
 * приходит из настроек ресурса, системное время сервера не используется нигде.
 */

export const MINUTES_IN_DAY = 1440;

/** Дата без времени в виде `YYYY-MM-DD` — то, что ходит в URL и в API. */
export type DateKey = string;

const pad = (value: number, length = 2) => String(value).padStart(length, "0");

export function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Календарная дата и минуты от полуночи → момент в UTC.
 *
 * Минуты могут быть больше 1440: так записывается время после полуночи для
 * ресурсов, которые работают за полночь (баня закрывается в 02:00 = 1560).
 */
export function zonedMinutesToUtc(dateKey: DateKey, minutes: number, timeZone: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);

  const dayOffset = Math.floor(minutes / MINUTES_IN_DAY);
  const withinDay = minutes - dayOffset * MINUTES_IN_DAY;

  // Календарное смещение считаем в UTC-полночь, чтобы не зацепить локальный
  // пояс машины: нам нужны только год-месяц-день, время добавляем строкой.
  const shifted = new Date(Date.UTC(year, month - 1, day + dayOffset));
  const wallClock =
    `${pad(shifted.getUTCFullYear(), 4)}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}` +
    `T${pad(Math.floor(withinDay / 60))}:${pad(withinDay % 60)}:00`;

  return fromZonedTime(wallClock, timeZone);
}

/** Момент в UTC → календарная дата в нужном поясе. */
export function utcToDateKey(date: Date, timeZone: string): DateKey {
  return formatInTimeZone(date, timeZone, "yyyy-MM-dd");
}

/** День недели в нужном поясе. 0 — воскресенье, как у `Date.getDay()`. */
export function weekdayInZone(dateKey: DateKey, timeZone: string): number {
  return toZonedTime(zonedMinutesToUtc(dateKey, 0, timeZone), timeZone).getDay();
}

/** Сдвиг календарной даты на N дней. Без арифметики над моментами времени. */
export function shiftDateKey(dateKey: DateKey, days: number): DateKey {
  const [year, month, day] = dateKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return `${pad(shifted.getUTCFullYear(), 4)}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** Разница в днях между календарными датами. */
export function daysBetween(from: DateKey, to: DateKey): number {
  const parse = (key: DateKey) => {
    const [year, month, day] = key.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((parse(to) - parse(from)) / (24 * 60 * 60 * 1000));
}

export function formatTime(date: Date, timeZone: string): string {
  return formatInTimeZone(date, timeZone, "HH:mm");
}

/** «17 сентября», «17 сентября 2027» — год добавляется только если он не текущий. */
export function formatDay(dateKey: DateKey, timeZone: string, today: DateKey): string {
  const date = zonedMinutesToUtc(dateKey, 12 * 60, timeZone);
  const sameYear = dateKey.slice(0, 4) === today.slice(0, 4);
  return formatInTimeZone(date, timeZone, sameYear ? "d MMMM" : "d MMMM yyyy", { locale: ru });
}

/** «пятница» — полное название дня недели. */
export function formatWeekdayLong(dateKey: DateKey, timeZone: string): string {
  const date = zonedMinutesToUtc(dateKey, 12 * 60, timeZone);
  return formatInTimeZone(date, timeZone, "EEEE", { locale: ru });
}

/** «сентябрь» или «январь 2027», если год не текущий. */
export function formatMonth(dateKey: DateKey, timeZone: string, today: DateKey): string {
  const date = zonedMinutesToUtc(dateKey, 12 * 60, timeZone);
  const sameYear = dateKey.slice(0, 4) === today.slice(0, 4);
  return formatInTimeZone(date, timeZone, sameYear ? "LLLL" : "LLLL yyyy", { locale: ru });
}

/** «ср» — короткий день недели для ленты дат. */
export function formatWeekdayShort(dateKey: DateKey, timeZone: string): string {
  const date = zonedMinutesToUtc(dateKey, 12 * 60, timeZone);
  return formatInTimeZone(date, timeZone, "EEEEEE", { locale: ru });
}

export function formatDateTime(date: Date, timeZone: string): string {
  return formatInTimeZone(date, timeZone, "d MMMM, HH:mm", { locale: ru });
}

/** «2 ч», «1 ч 15 мин», «45 мин». */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (hours === 0) return `${rest} мин`;
  if (rest === 0) return `${hours} ч`;
  return `${hours} ч ${rest} мин`;
}
