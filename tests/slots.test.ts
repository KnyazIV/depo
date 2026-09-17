import { describe, expect, it } from "vitest";

import { allowedDurations, buildDayAvailability } from "@/domain/slots";
import type { Interval, SlotView } from "@/domain/types";

import { HOURS, banya, busy, coworking, msk, quest, units } from "./fixtures";

const DATE = "2026-09-17";
/** «Сейчас» задаём явно: тесты не должны зависеть от часов машины. */
const NIGHT_BEFORE = msk("2026-09-16", "23:00");

function build(
  resource: Parameters<typeof buildDayAvailability>[0]["resource"],
  hours: { opensMin: number; closesMin: number },
  options: {
    unitCount?: number;
    busyByUnit?: Map<number, Interval[]>;
    now?: Date;
    date?: string;
  } = {},
) {
  return buildDayAvailability({
    resource,
    date: options.date ?? DATE,
    hours,
    units: units(options.unitCount ?? 1),
    busyByUnit: options.busyByUnit ?? new Map(),
    now: options.now ?? NIGHT_BEFORE,
  });
}

const labels = (slots: SlotView[]) => slots.map((slot) => slot.label);
const stateAt = (slots: SlotView[], label: string) =>
  slots.find((slot) => slot.label === label)?.state;

describe("сетка слотов", () => {
  it("коворкинг: старт каждый час с 9:00 до 20:00", () => {
    const day = build(coworking, HOURS.coworking, { unitCount: 12 });

    expect(day.isOpen).toBe(true);
    expect(day.hoursLabel).toBe("09:00 – 21:00");
    expect(labels(day.slots)).toHaveLength(12);
    expect(day.slots[0].label).toBe("09:00");
    expect(day.slots.at(-1)?.label).toBe("20:00");
  });

  it("баня: рабочее окно переходит через полночь, последний старт в 00:00", () => {
    const day = build(banya, HOURS.banya);

    expect(day.hoursLabel).toBe("10:00 – 02:00");
    expect(day.slots[0].label).toBe("10:00");
    // Минимум два часа, закрытие в 02:00 — значит позже полуночи не начать.
    expect(day.slots.at(-1)?.label).toBe("00:00");
    expect(labels(day.slots)).toHaveLength(15);
  });

  it("баня: слот после полуночи относится к следующим календарным суткам", () => {
    const day = build(banya, HOURS.banya);
    const midnight = day.slots.at(-1);

    expect(midnight?.start).toBe(msk("2026-09-18", "00:00").toISOString());
  });

  it("квест: сеансы идут с шагом 75 минут — час игры плюс сброс комнаты", () => {
    const day = build(quest, HOURS.quest);

    expect(labels(day.slots)).toEqual([
      "12:00",
      "13:15",
      "14:30",
      "15:45",
      "17:00",
      "18:15",
      "19:30",
      "20:45",
    ]);
  });
});

describe("занятость и буферы", () => {
  it("баня: бронь 12:00–14:00 закрывает старты вплоть до 14:00 из-за уборки", () => {
    // В blocked_period уже входят 30 минут на уборку: 12:00–14:30.
    const busyByUnit = new Map([[1, [busy(msk(DATE, "12:00"), msk(DATE, "14:30"))]]]);
    const day = build(banya, HOURS.banya, { busyByUnit });

    // Старт в 10:00 занял бы 10:00–12:00, но его собственная уборка до 12:30
    // залезает на чужую бронь — значит нельзя.
    expect(stateAt(day.slots, "10:00")).toBe("busy");
    expect(stateAt(day.slots, "11:00")).toBe("busy");
    expect(stateAt(day.slots, "12:00")).toBe("busy");
    expect(stateAt(day.slots, "14:00")).toBe("busy");
    // 14:30 не лежит на часовой сетке, поэтому ближайший свободный старт — 15:00.
    expect(stateAt(day.slots, "15:00")).toBe("free");
  });

  it("баня: перед чужой бронью длительность подрезается до влезающей", () => {
    const busyByUnit = new Map([[1, [busy(msk(DATE, "18:00"), msk(DATE, "20:30"))]]]);
    const day = build(banya, HOURS.banya, { busyByUnit });

    const at15 = day.slots.find((slot) => slot.label === "15:00");
    // 15:00 + 2 ч + уборка = 17:30 влезает, 15:00 + 3 ч + уборка = 18:30 уже нет.
    expect(at15?.maxDurationMin).toBe(120);
    expect(allowedDurations(banya, at15?.maxDurationMin ?? 0)).toEqual([120]);
  });

  it("коворкинг: занятое место не мешает остальным", () => {
    const busyByUnit = new Map([[1, [busy(msk(DATE, "10:00"), msk(DATE, "13:00"))]]]);
    const day = build(coworking, HOURS.coworking, { unitCount: 12, busyByUnit });

    const at11 = day.slots.find((slot) => slot.label === "11:00");
    expect(at11?.state).toBe("free");
    expect(at11?.units).toHaveLength(11);
    expect(at11?.units.some((unit) => unit.id === 1)).toBe(false);
  });

  it("коворкинг: когда заняты все места, слот становится занятым", () => {
    const interval = busy(msk(DATE, "10:00"), msk(DATE, "13:00"));
    const busyByUnit = new Map(units(3).map((unit) => [unit.id, [interval]]));
    const day = build(coworking, HOURS.coworking, { unitCount: 3, busyByUnit });

    expect(stateAt(day.slots, "11:00")).toBe("busy");
    expect(stateAt(day.slots, "13:00")).toBe("free");
  });

  it("длительность не вылезает за время закрытия", () => {
    const day = build(coworking, HOURS.coworking, { unitCount: 1 });
    const last = day.slots.at(-1);

    expect(last?.label).toBe("20:00");
    expect(last?.maxDurationMin).toBe(60);
  });
});

describe("время до начала и горизонт", () => {
  it("слоты раньше, чем через два часа, помечаются прошедшими", () => {
    const day = build(coworking, HOURS.coworking, {
      unitCount: 5,
      now: msk(DATE, "12:10"),
    });

    expect(stateAt(day.slots, "13:00")).toBe("past");
    expect(stateAt(day.slots, "14:00")).toBe("past");
    expect(stateAt(day.slots, "15:00")).toBe("free");
  });

  it("прошедшие слоты не раскрывают, кто их занял", () => {
    const busyByUnit = new Map([[1, [busy(msk(DATE, "09:00"), msk(DATE, "12:00"))]]]);
    const day = build(coworking, HOURS.coworking, {
      busyByUnit,
      now: msk(DATE, "12:10"),
    });

    expect(day.slots[0]).toMatchObject({ label: "09:00", state: "past", units: [] });
  });

  it("за горизонтом записи день закрыт", () => {
    const day = build(coworking, HOURS.coworking, { date: "2026-12-31" });

    expect(day.isOpen).toBe(false);
    expect(day.slots).toEqual([]);
  });

  it("вчерашний день закрыт", () => {
    const day = build(coworking, HOURS.coworking, { date: "2026-09-15" });

    expect(day.isOpen).toBe(false);
  });

  it("выходной день ресурса закрыт", () => {
    const day = buildDayAvailability({
      resource: coworking,
      date: DATE,
      hours: null,
      units: units(12),
      busyByUnit: new Map(),
      now: NIGHT_BEFORE,
    });

    expect(day.isOpen).toBe(false);
    expect(day.hoursLabel).toBeNull();
  });
});
