import "server-only";

import { and, desc, eq, lte, sql } from "drizzle-orm";

import { db, isTransientError, retryTransient } from "@/db/client";
import { bookings, resourceUnits, resources } from "@/db/schema";
import { generatePublicCode } from "@/lib/public-code";
import { weekdayInZone } from "@/lib/time";

import { computePrice } from "./pricing";
import { getHoursFor, listUnits, toResourceConfig } from "./resources";
import { candidateDates, resolveSlotStart, validateBooking } from "./rules";
import { blockedPeriodFor } from "./slots";
import type { ResourceConfig } from "./types";

/**
 * Создание и разбор заявок.
 *
 * Занятость решает не этот код, а EXCLUDE-constraint в базе: между проверкой
 * «свободно?» и вставкой в параллельной функции может проскочить кто угодно.
 * Поэтому бронь вставляется одним оператором `INSERT ... SELECT ... ON CONFLICT
 * DO NOTHING`: он сам выбирает свободную единицу и сам же откатывается, если
 * её успели занять между выбором и вставкой. Ноль вставленных строк — значит
 * не досталось.
 */

export type CreateBookingInput = {
  resource: ResourceConfig;
  start: Date;
  durationMin: number;
  /** null — «любая свободная единица». */
  unitId: number | null;
  name: string;
  phone: string;
  email: string | null;
  guests: number;
  comment: string | null;
  now?: Date;
};

export type BookingSummary = {
  id: string;
  publicCode: string;
  status: "pending" | "confirmed" | "rejected" | "cancelled" | "expired";
  resourceSlug: string;
  resourceTitle: string;
  unitId: number;
  unitTitle: string;
  start: Date;
  end: Date;
  durationMin: number;
  priceMinor: number;
  guests: number;
  expiresAt: Date;
  customerName: string;
  phone: string;
  email: string | null;
  comment: string | null;
  telegramMessageId: number | null;
  createdAt: Date;
};

export type CreateBookingOutcome =
  | { ok: true; booking: BookingSummary }
  | { ok: false; code: "slot_taken" | "invalid"; message: string };

type AttemptRow = {
  /** Нашлась ли вообще свободная единица на момент запроса. */
  had_candidate: number;
  id: string | null;
  public_code: string | null;
  unit_id: number | null;
  created_at: string | null;
};

type InsertedRow = {
  id: string;
  public_code: string;
  unit_id: number;
  created_at: string;
};

export async function createBooking(input: CreateBookingInput): Promise<CreateBookingOutcome> {
  const { resource } = input;
  const now = input.now ?? new Date();

  // 1. Время должно лежать на сетке слотов. У бани окно уезжает за полночь,
  //    поэтому кандидатов на «операционный день» всегда два.
  const dates = candidateDates(input.start, resource.timezone);
  const weekdays = dates.map((date) => weekdayInZone(date, resource.timezone));
  const hoursByWeekday = await getHoursFor(resource.id, weekdays);

  const dayHours = dates.map((date, index) => ({
    date,
    hours: hoursByWeekday.get(weekdays[index]) ?? null,
  }));

  const slot = resolveSlotStart(resource, dayHours, input.start);
  const failure = validateBooking({
    resource,
    slot,
    start: input.start,
    durationMin: input.durationMin,
    guests: input.guests,
    now,
  });

  if (failure) {
    return { ok: false, code: "invalid", message: failure.message };
  }

  const units = await listUnits(resource.id);
  const candidates = input.unitId ? units.filter((unit) => unit.id === input.unitId) : units;

  if (candidates.length === 0) {
    return { ok: false, code: "invalid", message: "Это место сейчас недоступно" };
  }

  const { start, end, blockedEnd } = blockedPeriodFor(input.start, input.durationMin, resource);
  const priceMinor = computePrice(resource, input.durationMin);
  const expiresAt = new Date(now.getTime() + resource.holdMin * 60_000);

  const database = db();

  // 2. Гасим протухшие холды. Отдельным оператором и до вставки: EXCLUDE-
  //    constraint не знает про expires_at, и мёртвая pending-заявка иначе
  //    продолжала бы держать слот, который в календаре показан свободным.
  await retryTransient(() =>
    database
      .update(bookings)
      .set({ status: "expired", updatedAt: new Date() })
      .where(
        and(
          eq(bookings.resourceId, resource.id),
          eq(bookings.status, "pending"),
          lte(bookings.expiresAt, sql`now()`),
        ),
      ),
  );

  const period = sql`tstzrange(${start.toISOString()}::timestamptz, ${end.toISOString()}::timestamptz, '[)')`;
  const blocked = sql`tstzrange(${start.toISOString()}::timestamptz, ${blockedEnd.toISOString()}::timestamptz, '[)')`;

  // 3. Попытки вставки. Каждая — отдельный атомарный оператор.
  //
  //    Повторяем, пока есть куда садиться: если выбранное место успели занять
  //    между подзапросом и вставкой, ON CONFLICT DO NOTHING вернёт ноль строк,
  //    а следующая попытка выберет другое свободное место. Когда свободных не
  //    остаётся, подзапрос сам возвращает пусто — и попытки заканчиваются.
  //
  //    Код заявки генерируется один раз на весь цикл и служит ключом
  //    идемпотентности: если ответ на вставку потерялся в сети, мы спрашиваем
  //    базу, долетела ли строка с этим кодом, и не создаём вторую.
  const publicCode = generatePublicCode();

  const runInsert = () =>
    database.execute<AttemptRow>(sql`
      with picked as (
        select u.id
        from ${resourceUnits} u
        where u.resource_id = ${resource.id}
          and u.is_active
          and (${input.unitId}::int is null or u.id = ${input.unitId}::int)
          and not exists (
            select 1
            from ${bookings} b
            where b.unit_id = u.id
              and b.status in ('pending', 'confirmed')
              and (b.status <> 'pending' or b.expires_at > now())
              and b.blocked_period && ${blocked}
          )
        order by u.sort, u.id
        limit 1
      ),
      inserted as (
        insert into ${bookings} (
          public_code, resource_id, unit_id, period, blocked_period, status,
          customer_name, phone, email, guests, comment, price_minor, expires_at
        )
        select
          ${publicCode},
          ${resource.id},
          picked.id,
          ${period},
          ${blocked},
          'pending'::booking_status,
          ${input.name},
          ${input.phone},
          ${input.email},
          ${input.guests},
          ${input.comment},
          ${priceMinor},
          ${expiresAt.toISOString()}::timestamptz
        from picked
        on conflict do nothing
        returning id, public_code, unit_id, created_at
      )
      select
        (select count(*)::int from picked) as had_candidate,
        inserted.id,
        inserted.public_code,
        inserted.unit_id,
        inserted.created_at
      from (select 1) as anchor
      left join inserted on true
    `);

  /** Долетела ли наша вставка, если ответ потерялся по дороге. */
  const findOwn = async (): Promise<InsertedRow | null> => {
    const [row] = await retryTransient(() =>
      database
        .select({ id: bookings.id, unitId: bookings.unitId, createdAt: bookings.createdAt })
        .from(bookings)
        .where(eq(bookings.publicCode, publicCode))
        .limit(1),
    );

    return row
      ? {
          id: row.id,
          public_code: publicCode,
          unit_id: row.unitId,
          created_at: row.createdAt.toISOString(),
        }
      : null;
  };

  const attempts = candidates.length + 2;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let row: InsertedRow | null = null;

    try {
      const [result] = (await runInsert()).rows;

      if (result?.id) {
        row = {
          id: result.id,
          public_code: result.public_code!,
          unit_id: result.unit_id!,
          created_at: result.created_at!,
        };
      } else if (!result || result.had_candidate === 0) {
        // Свободных единиц не осталось — повторять нечего.
        break;
      }
      // Иначе единица была, но её увели между выбором и вставкой: пробуем ещё.
    } catch (error) {
      if (!isTransientError(error)) throw error;
      row = await findOwn();
    }

    if (row) {
      return {
        ok: true,
        booking: {
          id: row.id,
          publicCode: row.public_code,
          status: "pending",
          resourceSlug: resource.slug,
          resourceTitle: resource.title,
          unitId: row.unit_id,
          unitTitle: candidates.find((unit) => unit.id === row.unit_id)?.title ?? "",
          start,
          end,
          durationMin: input.durationMin,
          priceMinor,
          guests: input.guests,
          expiresAt,
          customerName: input.name,
          phone: input.phone,
          email: input.email,
          comment: input.comment,
          telegramMessageId: null,
          createdAt: new Date(row.created_at),
        },
      };
    }
  }

  return {
    ok: false,
    code: "slot_taken",
    message: "Это время уже заняли, выберите другое",
  };
}

const summarySelect = {
  id: bookings.id,
  publicCode: bookings.publicCode,
  status: bookings.status,
  resourceSlug: resources.slug,
  resourceTitle: resources.title,
  unitId: bookings.unitId,
  unitTitle: resourceUnits.title,
  start: sql<string>`lower(${bookings.period})`,
  end: sql<string>`upper(${bookings.period})`,
  priceMinor: bookings.priceMinor,
  guests: bookings.guests,
  expiresAt: bookings.expiresAt,
  customerName: bookings.customerName,
  phone: bookings.phone,
  email: bookings.email,
  comment: bookings.comment,
  telegramMessageId: bookings.telegramMessageId,
  createdAt: bookings.createdAt,
};

type SummaryRow = Omit<BookingSummary, "start" | "end" | "durationMin"> & {
  start: string;
  end: string;
};

function toSummary(row: SummaryRow): BookingSummary {
  const start = new Date(row.start);
  const end = new Date(row.end);

  return {
    ...row,
    start,
    end,
    durationMin: Math.round((end.getTime() - start.getTime()) / 60_000),
  };
}

function summaryQuery() {
  return db()
    .select(summarySelect)
    .from(bookings)
    .innerJoin(resources, eq(resources.id, bookings.resourceId))
    .innerJoin(resourceUnits, eq(resourceUnits.id, bookings.unitId));
}

export async function getBookingByCode(code: string): Promise<BookingSummary | null> {
  const [row] = await retryTransient(() =>
    summaryQuery().where(eq(bookings.publicCode, code)).limit(1),
  );
  return row ? toSummary(row) : null;
}

export async function getBookingById(id: string): Promise<BookingSummary | null> {
  const [row] = await retryTransient(() => summaryQuery().where(eq(bookings.id, id)).limit(1));
  return row ? toSummary(row) : null;
}

/** Последние заявки для админки. Фильтр по статусу — необязательный. */
export async function listBookings(options: {
  status?: BookingSummary["status"];
  limit?: number;
}): Promise<BookingSummary[]> {
  const rows = await retryTransient(() =>
    summaryQuery()
      .where(options.status ? eq(bookings.status, options.status) : undefined)
      .orderBy(desc(bookings.createdAt))
      .limit(options.limit ?? 60),
  );

  return rows.map(toSummary);
}

export type Decision = "confirmed" | "rejected";

export type DecisionOutcome =
  { changed: true; booking: BookingSummary } | { changed: false; booking: BookingSummary | null };

/**
 * Решение администратора.
 *
 * Обновление условное — `where status = 'pending'`. Повторное нажатие кнопки
 * в Telegram не меняет ничего и честно говорит, что заявка уже обработана.
 *
 * Просроченную, но ещё не подметённую pending-заявку подтвердить можно: её
 * слот всё это время оставался занятым на уровне constraint, никто другой его
 * забрать не мог.
 */
export async function decideBooking(
  id: string,
  decision: Decision,
  adminId: number,
): Promise<DecisionOutcome> {
  const updated = await retryTransient(() =>
    db()
      .update(bookings)
      .set({
        status: decision,
        decidedBy: adminId,
        decidedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(bookings.id, id), eq(bookings.status, "pending")))
      .returning({ id: bookings.id }),
  );

  const booking = await getBookingById(id);

  if (!booking) return { changed: false, booking: null };

  // Повтор после сетевого сбоя мог не найти заявку в статусе pending просто
  // потому, что её обновила предыдущая, «потерявшаяся» попытка. Сверяемся с
  // тем, что в итоге лежит в базе, а не только с числом изменённых строк.
  const appliedByUs = booking.status === decision;

  return updated.length > 0 || appliedByUs
    ? { changed: updated.length > 0, booking }
    : { changed: false, booking };
}

export async function saveTelegramMessageId(id: string, messageId: number): Promise<void> {
  await retryTransient(() =>
    db()
      .update(bookings)
      .set({ telegramMessageId: messageId, updatedAt: new Date() })
      .where(eq(bookings.id, id)),
  );
}

/** Перевод просроченных заявок в expired. Вызывается кроном. */
export async function expireStaleBookings(): Promise<number> {
  const expired = await retryTransient(() =>
    db()
      .update(bookings)
      .set({ status: "expired", updatedAt: new Date() })
      .where(and(eq(bookings.status, "pending"), lte(bookings.expiresAt, sql`now()`)))
      .returning({ id: bookings.id }),
  );

  return expired.length;
}

export async function getResourceForBooking(slug: string): Promise<ResourceConfig | null> {
  const [row] = await retryTransient(() =>
    db()
      .select()
      .from(resources)
      .where(and(eq(resources.slug, slug), eq(resources.isActive, true)))
      .limit(1),
  );

  return row ? toResourceConfig(row) : null;
}
