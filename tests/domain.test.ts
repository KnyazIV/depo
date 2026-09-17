import { describe, expect, it } from "vitest";

import { computePrice, formatPrice, formatPriceRate } from "@/domain/pricing";
import {
  daysBetween,
  formatDuration,
  shiftDateKey,
  utcToDateKey,
  weekdayInZone,
  zonedMinutesToUtc,
} from "@/lib/time";
import { bookingRequestSchema, formatPhoneMask, normalizePhone } from "@/lib/validation/booking";

import { banya, coworking, quest } from "./fixtures";

describe("время", () => {
  it("минуты от полуночи переводятся в московское время", () => {
    expect(zonedMinutesToUtc("2026-09-17", 10 * 60, "Europe/Moscow").toISOString()).toBe(
      "2026-09-17T07:00:00.000Z",
    );
  });

  it("минуты больше суток уезжают на следующий день", () => {
    // 26:00 — это 02:00 следующих суток, время закрытия бани.
    expect(zonedMinutesToUtc("2026-09-17", 26 * 60, "Europe/Moscow").toISOString()).toBe(
      "2026-09-17T23:00:00.000Z",
    );
  });

  it("Калининград отличается от Москвы на час", () => {
    expect(zonedMinutesToUtc("2026-09-17", 10 * 60, "Europe/Kaliningrad").toISOString()).toBe(
      "2026-09-17T08:00:00.000Z",
    );
  });

  it("календарная дата считается в поясе ресурса, а не сервера", () => {
    // 22:30 UTC — в Москве уже следующие сутки.
    const late = new Date("2026-09-17T22:30:00.000Z");
    expect(utcToDateKey(late, "Europe/Moscow")).toBe("2026-09-18");
    expect(utcToDateKey(late, "Europe/Kaliningrad")).toBe("2026-09-18");
    expect(utcToDateKey(new Date("2026-09-17T20:30:00.000Z"), "Europe/Kaliningrad")).toBe(
      "2026-09-17",
    );
  });

  it("день недели совпадает с нумерацией Date.getDay()", () => {
    // 17 сентября 2026 — четверг.
    expect(weekdayInZone("2026-09-17", "Europe/Moscow")).toBe(4);
  });

  it("сдвиг даты переживает конец месяца", () => {
    expect(shiftDateKey("2026-09-30", 1)).toBe("2026-10-01");
    expect(shiftDateKey("2026-01-01", -1)).toBe("2025-12-31");
    expect(daysBetween("2026-09-17", "2026-10-17")).toBe(30);
  });

  it("длительность читается по-русски", () => {
    expect(formatDuration(60)).toBe("1 ч");
    expect(formatDuration(120)).toBe("2 ч");
    expect(formatDuration(75)).toBe("1 ч 15 мин");
    expect(formatDuration(45)).toBe("45 мин");
  });
});

describe("цены", () => {
  it("почасовой ресурс умножает ставку на часы", () => {
    expect(computePrice(coworking, 60)).toBe(35_000);
    expect(computePrice(coworking, 180)).toBe(105_000);
    expect(computePrice(banya, 120)).toBe(700_000);
  });

  it("сеансовый ресурс стоит одинаково независимо от длительности", () => {
    expect(computePrice(quest, 60)).toBe(450_000);
    expect(computePrice(quest, 120)).toBe(450_000);
  });

  it("формат цены не зависит от локали окружения", () => {
    expect(formatPrice(350_000)).toBe("3 500 ₽");
    expect(formatPrice(35_000)).toBe("350 ₽");
    expect(formatPriceRate(quest)).toBe("4 500 ₽ за сеанс");
    expect(formatPriceRate(coworking)).toBe("350 ₽ в час");
  });
});

describe("телефон", () => {
  it("любой человеческий ввод приводится к +7XXXXXXXXXX", () => {
    expect(normalizePhone("8 (901) 234-56-78")).toBe("+79012345678");
    expect(normalizePhone("+7 901 234 56 78")).toBe("+79012345678");
    expect(normalizePhone("9012345678")).toBe("+79012345678");
  });

  it("маска собирается по мере ввода", () => {
    expect(formatPhoneMask("9")).toBe("+7 (9");
    expect(formatPhoneMask("901")).toBe("+7 (901)");
    expect(formatPhoneMask("9012345678")).toBe("+7 (901) 234-56-78");
    expect(formatPhoneMask("89012345678")).toBe("+7 (901) 234-56-78");
  });
});

describe("схема заявки", () => {
  const valid = {
    slug: "banya",
    start: "2026-09-17T15:00:00.000Z",
    durationMin: 120,
    unitId: null,
    name: "  Иван  ",
    phone: "8 (901) 234-56-78",
    email: "",
    guests: 4,
    comment: "",
    consent: true as const,
    website: "",
  };

  it("нормализует то, что ввёл человек", () => {
    const parsed = bookingRequestSchema.parse(valid);

    expect(parsed.name).toBe("Иван");
    expect(parsed.phone).toBe("+79012345678");
    expect(parsed.email).toBeNull();
    expect(parsed.comment).toBeNull();
  });

  it("не принимает заявку без согласия на обработку данных", () => {
    const result = bookingRequestSchema.safeParse({ ...valid, consent: false });

    expect(result.success).toBe(false);
  });

  it("ловит опечатку в номере", () => {
    expect(bookingRequestSchema.safeParse({ ...valid, phone: "+7 123" }).success).toBe(false);
    expect(bookingRequestSchema.safeParse({ ...valid, phone: "+70012345678" }).success).toBe(false);
  });

  it("отвергает заполненную ловушку для ботов", () => {
    expect(bookingRequestSchema.safeParse({ ...valid, website: "http://spam" }).success).toBe(
      false,
    );
  });

  it("проверяет почту, только если её указали", () => {
    expect(bookingRequestSchema.safeParse({ ...valid, email: "не почта" }).success).toBe(false);
    expect(bookingRequestSchema.parse({ ...valid, email: "A@B.RU" }).email).toBe("a@b.ru");
  });
});
