import "server-only";

import { and, eq, gt, inArray, or, sql } from "drizzle-orm";

import { db, retryTransient } from "@/db/client";
import { HOLDING_STATUSES, bookings, resourceClosures } from "@/db/schema";
import {
  type DateKey,
  daysBetween,
  formatTime,
  shiftDateKey,
  utcToDateKey,
  weekdayInZone,
} from "@/lib/time";

import { getHours, listUnits, type WorkingHoursRow } from "./resources";
import { type HourCell, buildDayAvailability, buildHourStrip, workingWindow } from "./slots";
import type { DayAvailability, Interval, ResourceConfig, UnitView } from "./types";

/** Сборка занятости: ходит в базу и отдаёт готовую сетку слотов или полосу часов. */

/**
 * Брони, которые реально держат слот.
 *
 * Просроченные pending отсекаются прямо здесь, по `expires_at > now()`, а не
 * ждут крона: иначе календарь показывал бы занятым слот, который уже отпущен,
 * и всё зависело бы от частоты фоновой задачи.
 */
function holdingBookings() {
  return and(
    inArray(bookings.status, [...HOLDING_STATUSES]),
    or(eq(bookings.status, "confirmed"), gt(bookings.expiresAt, sql`now()`)),
  );
}

const rangeOverlaps = (column: unknown, from: Date, to: Date) =>
  sql`${column} && tstzrange(${from.toISOString()}::timestamptz, ${to.toISOString()}::timestamptz, '[)')`;

async function loadBusyIntervals(
  resource: ResourceConfig,
  units: UnitView[],
  from: Date,
  to: Date,
): Promise<Map<number, Interval[]>> {
  const database = db();

  const [booked, closures] = await Promise.all([
    retryTransient(() =>
      database
        .select({
          unitId: bookings.unitId,
          start: sql<string>`lower(${bookings.blockedPeriod})`,
          end: sql<string>`upper(${bookings.blockedPeriod})`,
        })
        .from(bookings)
        .where(
          and(
            eq(bookings.resourceId, resource.id),
            holdingBookings(),
            rangeOverlaps(bookings.blockedPeriod, from, to),
          ),
        ),
    ),

    retryTransient(() =>
      database
        .select({
          unitId: resourceClosures.unitId,
          start: sql<string>`lower(${resourceClosures.period})`,
          end: sql<string>`upper(${resourceClosures.period})`,
        })
        .from(resourceClosures)
        .where(
          and(
            eq(resourceClosures.resourceId, resource.id),
            rangeOverlaps(resourceClosures.period, from, to),
          ),
        ),
    ),
  ]);

  const byUnit = new Map<number, Interval[]>(units.map((unit) => [unit.id, []]));

  const push = (unitId: number, start: string, end: string) => {
    byUnit.get(unitId)?.push({ start: new Date(start), end: new Date(end) });
  };

  for (const row of booked) {
    push(row.unitId, row.start, row.end);
  }

  // Закрытие без указания единицы гасит ресурс целиком.
  for (const row of closures) {
    if (row.unitId === null) {
      for (const unit of units) push(unit.id, row.start, row.end);
    } else {
      push(row.unitId, row.start, row.end);
    }
  }

  return byUnit;
}

type DayContext = {
  resource: ResourceConfig;
  date: DateKey;
  hours: WorkingHoursRow | null;
  units: UnitView[];
  busyByUnit: Map<number, Interval[]>;
  now: Date;
};

async function loadDay(resource: ResourceConfig, date: DateKey, now: Date): Promise<DayContext> {
  const [units, hours] = await Promise.all([
    listUnits(resource.id),
    getHours(resource.id, weekdayInZone(date, resource.timezone)),
  ]);

  if (!hours) {
    return { resource, date, hours: null, units, busyByUnit: new Map(), now };
  }

  const { open, close } = workingWindow(date, hours, resource.timezone);
  const busyByUnit = await loadBusyIntervals(resource, units, open, close);

  return { resource, date, hours, units, busyByUnit, now };
}

export async function getDayAvailability(
  resource: ResourceConfig,
  date: DateKey,
  now = new Date(),
): Promise<DayAvailability> {
  return buildDayAvailability(await loadDay(resource, date, now));
}

export type BoardRow = {
  resource: ResourceConfig;
  cells: HourCell[];
  unitsTotal: number;
  /** Сколько единиц свободно прямо сейчас. */
  unitsFreeNow: number;
  freeSlots: number;
  /** Есть ли сегодня слоты, занятые чужими бронями. */
  hasBusy: boolean;
  /** Ближайшее свободное время сегодня: «18:00». */
  nextFree: string | null;
  isOpenToday: boolean;
};

export type Board = {
  date: DateKey;
  /** Сегодняшняя дата в поясе комплекса — по ней подписывается заголовок. */
  today: DateKey;
  timezone: string;
  /** До какой даты открыта запись. */
  lastDate: DateKey;
  axis: { fromMin: number; toMin: number };
  rows: BoardRow[];
};

/** Минуты от полуночи по местному времени. */
function minutesOfDay(date: Date, timeZone: string): number {
  const [hours, minutes] = formatTime(date, timeZone).split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Табло — то, с чего начинается главная.
 *
 * Все ресурсы лежат на одной оси часов, поэтому их полосы можно сравнивать
 * взглядом. В ответ уходят только состояния часов: ни имён, ни телефонов.
 *
 * День передаётся снаружи: главная умеет листать даты, а не только показывать
 * сегодняшний день.
 */
export async function getBoard(
  list: ResourceConfig[],
  date?: DateKey,
  now = new Date(),
): Promise<Board> {
  const timezone = list[0]?.timezone ?? "Europe/Moscow";
  const today = utcToDateKey(now, timezone);
  const horizon = Math.max(0, ...list.map((resource) => resource.horizonDays));
  const lastDate = shiftDateKey(today, horizon);

  // Дату можно подсунуть в адресе руками, поэтому подрезаем её по горизонту:
  // показывать прошлое или год вперёд бессмысленно.
  const requested = date ?? today;
  const target =
    daysBetween(today, requested) < 0
      ? today
      : daysBetween(requested, lastDate) < 0
        ? lastDate
        : requested;

  const days = await Promise.all(list.map((resource) => loadDay(resource, target, now)));

  // Ось общая: от самого раннего открытия до самого позднего закрытия.
  const windows = days.map((day) => day.hours).filter((hours) => hours !== null);
  const axis = {
    fromMin: windows.length > 0 ? Math.min(...windows.map((h) => h.opensMin)) : 9 * 60,
    toMin: windows.length > 0 ? Math.max(...windows.map((h) => h.closesMin)) : 22 * 60,
  };

  const rows = days.map((day) => {
    const cells = buildHourStrip(day, axis);
    const availability = buildDayAvailability(day);
    const free = availability.slots.filter((slot) => slot.state === "free");

    const nowMinutes = minutesOfDay(now, day.resource.timezone);
    const currentCell = cells.find(
      (cell) => cell.offsetMin <= nowMinutes && nowMinutes < cell.offsetMin + 60,
    );

    return {
      resource: day.resource,
      cells,
      unitsTotal: day.units.length,
      unitsFreeNow: currentCell?.state === "free" ? currentCell.unitsFree : 0,
      freeSlots: free.length,
      hasBusy: availability.slots.some((slot) => slot.state === "busy"),
      nextFree: free[0]?.label ?? null,
      isOpenToday: availability.isOpen,
    };
  });

  return { date: target, today, timezone, lastDate, axis, rows };
}

export { holdingBookings };
