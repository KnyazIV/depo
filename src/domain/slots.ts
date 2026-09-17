import {
  type DateKey,
  MINUTES_IN_DAY,
  daysBetween,
  formatTime,
  utcToDateKey,
  zonedMinutesToUtc,
} from "@/lib/time";

import type {
  DayAvailability,
  Interval,
  ResourceConfig,
  SlotState,
  SlotUnit,
  SlotView,
  UnitView,
} from "./types";

/**
 * Генерация сетки слотов.
 *
 * Модуль намеренно чистый: никаких обращений к базе и к системным часам.
 * Те же функции считают доступность на сервере и пересчитывают её в браузере,
 * поэтому расхождений между календарём и ответом API быть не может.
 */

export type WorkingHours = {
  /** Минуты от полуночи. */
  opensMin: number;
  /** Может быть больше 1440 — работа за полночь. */
  closesMin: number;
};

export type DayInput = {
  resource: ResourceConfig;
  date: DateKey;
  hours: WorkingHours | null;
  units: UnitView[];
  /** Занятые интервалы по единицам: уже с учётом буферов чужих броней. */
  busyByUnit: Map<number, Interval[]>;
  now: Date;
};

const minutesToMs = (minutes: number) => minutes * 60_000;
const addMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutesToMs(minutes));

function overlapsAny(start: Date, end: Date, intervals: Interval[]): boolean {
  return intervals.some((interval) => start < interval.end && end > interval.start);
}

/**
 * Максимальная длительность, доступная с этого старта на одной единице.
 *
 * Перебираем длительности шагом сетки от минимальной к максимальной и
 * останавливаемся на первой, которая упирается в закрытие или в чужую бронь.
 * Проверяем не саму бронь, а её блокирующий период — время клиента плюс
 * технический перерыв. Точно так же считает EXCLUDE-constraint в базе.
 */
function maxDurationFrom(
  start: Date,
  close: Date,
  busy: Interval[],
  resource: ResourceConfig,
): number {
  let best = 0;

  for (
    let duration = resource.minDurationMin;
    duration <= resource.maxDurationMin;
    duration += resource.slotStepMin
  ) {
    const end = addMinutes(start, duration);
    if (end > close) break;

    const blockedEnd = addMinutes(end, resource.bufferMin);
    if (overlapsAny(start, blockedEnd, busy)) break;

    best = duration;
  }

  return best;
}

/** Границы рабочего окна дня в UTC. Закрытие может уехать на следующие сутки. */
export function workingWindow(
  date: DateKey,
  hours: WorkingHours,
  timeZone: string,
): { open: Date; close: Date } {
  return {
    open: zonedMinutesToUtc(date, hours.opensMin, timeZone),
    close: zonedMinutesToUtc(date, hours.closesMin, timeZone),
  };
}

/** Подпись часов работы: «10:00 – 02:00». */
export function hoursLabel(hours: WorkingHours): string {
  const render = (minutes: number) => {
    const normalized = minutes % MINUTES_IN_DAY;
    return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
  };
  return `${render(hours.opensMin)} – ${render(hours.closesMin)}`;
}

/** Открыта ли дата для записи: не в прошлом и не дальше горизонта. */
export function isWithinHorizon(date: DateKey, resource: ResourceConfig, now: Date): boolean {
  const today = utcToDateKey(now, resource.timezone);
  const offset = daysBetween(today, date);
  return offset >= 0 && offset <= resource.horizonDays;
}

export function buildDayAvailability(input: DayInput): DayAvailability {
  const { resource, date, hours, units, busyByUnit, now } = input;

  const base = {
    date,
    timezone: resource.timezone,
    now: now.toISOString(),
    units,
  };

  if (!hours || !isWithinHorizon(date, resource, now)) {
    return { ...base, isOpen: false, hoursLabel: null, slots: [] };
  }

  // Начало окна отдельно не нужно: старты и так растут от hours.opensMin.
  const { close } = workingWindow(date, hours, resource.timezone);

  // Раньше этого момента заявку принимать нельзя: администратору нужно время.
  const earliestStart = addMinutes(now, resource.minLeadMin);

  const slots: SlotView[] = [];

  for (
    let offset = hours.opensMin;
    offset + resource.minDurationMin <= hours.closesMin;
    offset += resource.slotStepMin
  ) {
    const start = zonedMinutesToUtc(date, offset, resource.timezone);
    const label = formatTime(start, resource.timezone);

    if (start < earliestStart) {
      slots.push({
        start: start.toISOString(),
        label,
        state: "past",
        units: [],
        maxDurationMin: 0,
      });
      continue;
    }

    const free: SlotUnit[] = [];

    for (const unit of units) {
      const duration = maxDurationFrom(start, close, busyByUnit.get(unit.id) ?? [], resource);
      if (duration >= resource.minDurationMin) {
        free.push({ id: unit.id, maxDurationMin: duration });
      }
    }

    slots.push({
      start: start.toISOString(),
      label,
      state: free.length > 0 ? "free" : "busy",
      units: free,
      maxDurationMin: free.reduce((max, unit) => Math.max(max, unit.maxDurationMin), 0),
    });
  }

  return { ...base, isOpen: true, hoursLabel: hoursLabel(hours), slots };
}

export type HourCell = {
  /** Минуты от полуночи операционного дня: 25 * 60 — это час ночи следующих суток. */
  offsetMin: number;
  label: string;
  state: SlotState;
  unitsFree: number;
};

/**
 * Часовая полоса занятости — то, что видно на главной.
 *
 * Считается не по слотам, а по занятым интервалам: у квеста сеансы идут с
 * шагом 75 минут и на часовую сетку не ложатся, а полоса должна честно
 * показывать, в какие часы комната занята.
 */
export function buildHourStrip(
  input: DayInput,
  axis: { fromMin: number; toMin: number },
): HourCell[] {
  const { resource, date, hours, units, busyByUnit, now } = input;
  const cells: HourCell[] = [];

  // Тот же порог, что и в сетке слотов: час, в котором уже нельзя начать,
  // показываем прошедшим. Иначе полоса обещала бы то, чего форма не даёт.
  const earliestStart = addMinutes(now, resource.minLeadMin);

  for (let offsetMin = axis.fromMin; offsetMin < axis.toMin; offsetMin += 60) {
    const label = `${String(Math.floor((offsetMin % MINUTES_IN_DAY) / 60)).padStart(2, "0")}`;

    if (!hours || offsetMin < hours.opensMin || offsetMin + 60 > hours.closesMin) {
      cells.push({ offsetMin, label, state: "closed", unitsFree: 0 });
      continue;
    }

    const start = zonedMinutesToUtc(date, offsetMin, resource.timezone);
    const end = addMinutes(start, 60);

    if (start < earliestStart) {
      cells.push({ offsetMin, label, state: "past", unitsFree: 0 });
      continue;
    }

    const unitsFree = units.filter(
      (unit) => !overlapsAny(start, end, busyByUnit.get(unit.id) ?? []),
    ).length;

    cells.push({
      offsetMin,
      label,
      state: unitsFree > 0 ? "free" : "busy",
      unitsFree,
    });
  }

  return cells;
}

/** Допустимые длительности с выбранного старта: от минимальной до доступной. */
export function allowedDurations(resource: ResourceConfig, maxDurationMin: number): number[] {
  const durations: number[] = [];

  for (
    let duration = resource.minDurationMin;
    duration <= Math.min(resource.maxDurationMin, maxDurationMin);
    duration += resource.slotStepMin
  ) {
    durations.push(duration);
  }

  return durations;
}

/** Блокирующий период новой брони: время клиента плюс технический перерыв. */
export function blockedPeriodFor(
  start: Date,
  durationMin: number,
  resource: ResourceConfig,
): { start: Date; end: Date; blockedEnd: Date } {
  const end = addMinutes(start, durationMin);
  return { start, end, blockedEnd: addMinutes(end, resource.bufferMin) };
}
