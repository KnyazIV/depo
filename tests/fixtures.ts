import type { Interval, ResourceConfig, UnitView } from "@/domain/types";

/** Настройки из сида, чтобы тесты проверяли то, что реально поедет в продакшен. */

const BASE = {
  timezone: "Europe/Moscow",
  horizonDays: 30,
  minLeadMin: 120,
  holdMin: 30,
  description: "",
  subtitle: "",
} as const;

export const coworking: ResourceConfig = {
  ...BASE,
  id: 1,
  slug: "coworking",
  kind: "seats",
  title: "Коворкинг",
  unitNoun: "место",
  priceKind: "per_hour",
  priceMinor: 35_000,
  slotStepMin: 60,
  minDurationMin: 60,
  maxDurationMin: 720,
  bufferMin: 0,
  minGuests: 1,
  maxGuests: 1,
  asksGuests: false,
};

export const banya: ResourceConfig = {
  ...BASE,
  id: 2,
  slug: "banya",
  kind: "whole",
  title: "Баня",
  unitNoun: "баня",
  priceKind: "per_hour",
  priceMinor: 350_000,
  slotStepMin: 60,
  minDurationMin: 120,
  maxDurationMin: 360,
  bufferMin: 30,
  minGuests: 2,
  maxGuests: 8,
  asksGuests: true,
};

export const quest: ResourceConfig = {
  ...BASE,
  id: 3,
  slug: "quest",
  kind: "sessions",
  title: "Квест-комната",
  unitNoun: "комната",
  priceKind: "per_session",
  priceMinor: 450_000,
  slotStepMin: 75,
  minDurationMin: 60,
  maxDurationMin: 60,
  bufferMin: 15,
  minGuests: 2,
  maxGuests: 6,
  asksGuests: true,
};

export const HOURS = {
  coworking: { opensMin: 9 * 60, closesMin: 21 * 60 },
  banya: { opensMin: 10 * 60, closesMin: 26 * 60 },
  quest: { opensMin: 12 * 60, closesMin: 22 * 60 },
};

export function units(count: number): UnitView[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    code: `U${index + 1}`,
    title: `Единица ${index + 1}`,
  }));
}

/** Момент по московскому времени указанной даты. */
export function msk(date: string, time: string): Date {
  return new Date(`${date}T${time}:00+03:00`);
}

/** Занятый интервал — уже с учётом буфера, как он лежит в blocked_period. */
export function busy(start: Date, end: Date): Interval {
  return { start, end };
}
