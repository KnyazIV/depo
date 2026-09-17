import { type DateKey, utcToDateKey, zonedMinutesToUtc } from "@/lib/time";

import { isWithinHorizon, type WorkingHours } from "./slots";
import type { ResourceConfig } from "./types";

/**
 * Правила бронирования.
 *
 * Чистые проверки, которые делает сервер перед вставкой. Они не заменяют
 * EXCLUDE-constraint (занятость решает база), а отсекают заведомо неправильные
 * запросы: время не по сетке, слишком короткую бронь, лишних гостей.
 */

export type ResolvedSlot = {
  /** Операционный день, к которому относится слот. */
  date: DateKey;
  hours: WorkingHours;
  /** Минуты от полуночи операционного дня. Может быть больше 1440. */
  offsetMin: number;
};

export type DayHours = { date: DateKey; hours: WorkingHours | null };

/**
 * Календарные дни, чьё рабочее окно может накрывать этот момент.
 *
 * Для бани слот в 00:30 относится к предыдущему операционному дню, поэтому
 * кандидатов всегда два: сегодня и вчера по местному времени.
 */
export function candidateDates(start: Date, timeZone: string): DateKey[] {
  const today = utcToDateKey(start, timeZone);
  const [year, month, day] = today.split("-").map(Number);
  const previous = new Date(Date.UTC(year, month - 1, day - 1));
  const pad = (value: number, length = 2) => String(value).padStart(length, "0");

  return [
    today,
    `${pad(previous.getUTCFullYear(), 4)}-${pad(previous.getUTCMonth() + 1)}-${pad(previous.getUTCDate())}`,
  ];
}

/** Лежит ли момент на сетке слотов какого-нибудь из операционных дней. */
export function resolveSlotStart(
  resource: ResourceConfig,
  candidates: DayHours[],
  start: Date,
): ResolvedSlot | null {
  for (const candidate of candidates) {
    if (!candidate.hours) continue;

    const open = zonedMinutesToUtc(candidate.date, candidate.hours.opensMin, resource.timezone);
    const fromOpen = (start.getTime() - open.getTime()) / 60_000;

    if (fromOpen < 0 || !Number.isInteger(fromOpen)) continue;
    if (fromOpen % resource.slotStepMin !== 0) continue;

    const offsetMin = candidate.hours.opensMin + fromOpen;
    if (offsetMin + resource.minDurationMin > candidate.hours.closesMin) continue;

    return { date: candidate.date, hours: candidate.hours, offsetMin };
  }

  return null;
}

export type RuleFailure = { code: string; message: string };

/** Полная проверка заявки до обращения к базе. */
export function validateBooking(input: {
  resource: ResourceConfig;
  slot: ResolvedSlot | null;
  start: Date;
  durationMin: number;
  guests: number;
  now: Date;
}): RuleFailure | null {
  const { resource, slot, start, durationMin, guests, now } = input;

  if (!slot) {
    return { code: "bad_slot", message: "Такого времени нет в расписании — выберите слот заново" };
  }

  if (!isWithinHorizon(slot.date, resource, now)) {
    return {
      code: "out_of_horizon",
      message: `Записаться можно не дальше чем на ${resource.horizonDays} дней вперёд`,
    };
  }

  const earliest = new Date(now.getTime() + resource.minLeadMin * 60_000);
  if (start < earliest) {
    const hours = Math.round(resource.minLeadMin / 60);
    return {
      code: "too_soon",
      message: `Бронь принимаем минимум за ${hours} ч до начала — выберите время позже`,
    };
  }

  if (durationMin < resource.minDurationMin) {
    return {
      code: "too_short",
      message: `Минимальная бронь — ${Math.round(resource.minDurationMin / 60)} ч`,
    };
  }

  if (durationMin > resource.maxDurationMin) {
    return {
      code: "too_long",
      message: `Максимальная бронь — ${Math.round(resource.maxDurationMin / 60)} ч`,
    };
  }

  if ((durationMin - resource.minDurationMin) % resource.slotStepMin !== 0) {
    return { code: "bad_duration", message: "Такая длительность недоступна" };
  }

  if (slot.offsetMin + durationMin > slot.hours.closesMin) {
    return { code: "past_closing", message: "Бронь выходит за время закрытия" };
  }

  if (guests < resource.minGuests || guests > resource.maxGuests) {
    return {
      code: "bad_guests",
      message: `Количество гостей — от ${resource.minGuests} до ${resource.maxGuests}`,
    };
  }

  return null;
}
