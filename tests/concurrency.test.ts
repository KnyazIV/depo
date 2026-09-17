import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { bookings } from "@/db/schema";
import { getDayAvailability } from "@/domain/availability";
import { createBooking } from "@/domain/booking";
import { getResourceBySlug } from "@/domain/resources";
import type { ResourceConfig } from "@/domain/types";
import { shiftDateKey, utcToDateKey } from "@/lib/time";

/**
 * Главный тест этого проекта.
 *
 * Двадцать человек жмут «Забронировать» на один и тот же слот в одну и ту же
 * секунду. Проверка «свободно ли время» в коде здесь бесполезна: все двадцать
 * функций увидят слот свободным. Пройти должен ровно один — и это обязан
 * обеспечить EXCLUDE-constraint, а не приложение.
 *
 * Нужна настоящая база: `TEST_DATABASE_URL` в .env.local, желательно на
 * отдельной ветке Neon. Без неё тест помечается пропущенным, а не падает.
 */

const HAS_DB = Boolean(process.env.TEST_DATABASE_URL);
const suite = HAS_DB ? describe : describe.skip;

const MARKER = "ТЕСТ Конкурентность";
const ATTEMPTS = 20;

suite("двойная бронь", () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  async function cleanup() {
    await db().delete(bookings).where(eq(bookings.customerName, MARKER));
  }

  /** Первый свободный слот в ближайшие дни — чтобы тест не зависел от даты прогона. */
  async function findFreeSlot(slug: string) {
    const resource = await getResourceBySlug(slug);
    if (!resource) throw new Error(`Ресурс ${slug} не найден — прогоните pnpm db:seed`);

    const now = new Date();

    for (let offset = 1; offset <= 14; offset += 1) {
      const date = shiftDateKey(utcToDateKey(now, resource.timezone), offset);
      const day = await getDayAvailability(resource, date, now);
      const slot = day.slots.find((item) => item.state === "free");

      if (slot) {
        return { resource, date, start: new Date(slot.start), units: day.units.length };
      }
    }

    throw new Error(`Не нашлось свободного слота для ${slug}`);
  }

  function attempt(resource: ResourceConfig, start: Date) {
    return createBooking({
      resource,
      start,
      durationMin: resource.minDurationMin,
      unitId: null,
      name: MARKER,
      phone: "+79012345678",
      email: null,
      guests: resource.minGuests,
      comment: null,
    });
  }

  it("баня: из двадцати одновременных заявок проходит ровно одна", async () => {
    const { resource, start } = await findFreeSlot("banya");

    const outcomes = await Promise.all(
      Array.from({ length: ATTEMPTS }, () => attempt(resource, start)),
    );

    const accepted = outcomes.filter((outcome) => outcome.ok);
    const rejected = outcomes.filter((outcome) => !outcome.ok && outcome.code === "slot_taken");

    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(ATTEMPTS - 1);

    // Отказ должен быть понятным человеку, а не текстом ошибки Postgres.
    expect(rejected[0]).toMatchObject({ message: "Это время уже заняли, выберите другое" });
  });

  it("коворкинг: занимаются все места и ни одним больше", async () => {
    const { resource, start, units } = await findFreeSlot("coworking");

    const outcomes = await Promise.all(
      Array.from({ length: ATTEMPTS }, () => attempt(resource, start)),
    );

    const accepted = outcomes.filter((outcome) => outcome.ok);

    expect(accepted).toHaveLength(units);
    expect(outcomes.filter((outcome) => !outcome.ok)).toHaveLength(ATTEMPTS - units);

    // Каждая заявка села на своё место — одно место дважды не ушло.
    const seats = accepted.map((outcome) => (outcome.ok ? outcome.booking.unitId : 0));
    expect(new Set(seats).size).toBe(units);
  });

  it("слот освобождается, когда холд протухает", async () => {
    const { resource, date, start } = await findFreeSlot("banya");

    const first = await attempt(resource, start);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    // Повторная попытка упирается в живой холд.
    expect(await attempt(resource, start)).toMatchObject({ ok: false, code: "slot_taken" });

    // Отматываем срок удержания назад — так же, как это сделает время.
    await db()
      .update(bookings)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(bookings.id, first.booking.id));

    // Календарь обязан показать слот свободным, не дожидаясь крона.
    const day = await getDayAvailability(resource, date, new Date());
    const slot = day.slots.find((item) => item.start === start.toISOString());
    expect(slot?.state).toBe("free");

    // И заявка на него теперь проходит.
    expect(await attempt(resource, start)).toMatchObject({ ok: true });
  });
});
