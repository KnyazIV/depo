import type { DateKey } from "@/lib/time";

/** Настройки ресурса в том виде, в каком их можно отдать в браузер. */
export type ResourceConfig = {
  id: number;
  slug: string;
  kind: "seats" | "whole" | "sessions";
  title: string;
  subtitle: string;
  description: string;
  unitNoun: string;
  timezone: string;
  priceKind: "per_hour" | "per_session";
  priceMinor: number;
  slotStepMin: number;
  minDurationMin: number;
  maxDurationMin: number;
  bufferMin: number;
  horizonDays: number;
  minLeadMin: number;
  holdMin: number;
  minGuests: number;
  maxGuests: number;
  asksGuests: boolean;
};

export type Interval = { start: Date; end: Date };

/**
 * Состояние слота.
 *
 * `past` — время ушло или до начала осталось меньше, чем требует ресурс.
 * `busy` — занято чужой бронью или техническим перерывом.
 * `closed` — вне часов работы или за горизонтом записи.
 */
export type SlotState = "free" | "busy" | "past" | "closed";

export type SlotUnit = {
  id: number;
  /** Максимальная длительность, которую можно взять на этой единице с этого старта. */
  maxDurationMin: number;
};

export type SlotView = {
  /** Начало слота, ISO в UTC. */
  start: string;
  /** Подпись в часовом поясе ресурса: «10:00». */
  label: string;
  state: SlotState;
  /** Единицы, свободные с этого старта хотя бы на минимальную длительность. */
  units: SlotUnit[];
  /** Максимум по всем единицам. 0, если слот занят. */
  maxDurationMin: number;
};

export type UnitView = {
  id: number;
  code: string;
  title: string;
};

export type DayAvailability = {
  date: DateKey;
  timezone: string;
  /** Серверное «сейчас»: часы на устройстве клиента могут врать. */
  now: string;
  isOpen: boolean;
  /** «10:00 – 02:00», null для выходного дня. */
  hoursLabel: string | null;
  units: UnitView[];
  slots: SlotView[];
};

export type AvailabilityResponse = {
  resource: ResourceConfig;
  availability: DayAvailability;
};
