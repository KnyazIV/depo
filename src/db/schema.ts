import {
  bigint,
  boolean,
  check,
  customType,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Диапазон времени с часовым поясом.
 *
 * Drizzle не знает про range-типы Postgres, поэтому объявляем свой. Читать
 * колонку как строку неудобно, поэтому в запросах мы почти всегда достаём
 * `lower(period)` и `upper(period)` отдельными полями, а сам range нужен
 * ради оператора пересечения `&&` в EXCLUDE-constraint.
 */
const tstzrange = customType<{ data: string; driverData: string }>({
  dataType: () => "tstzrange",
});

export const resourceKind = pgEnum("resource_kind", [
  /** Несколько независимых единиц: коворкинг с рабочими местами. */
  "seats",
  /** Ресурс целиком: баня. */
  "whole",
  /** Фиксированные сеансы по расписанию: квест-комната. */
  "sessions",
]);

export const priceKind = pgEnum("price_kind", ["per_hour", "per_session"]);

export const bookingStatus = pgEnum("booking_status", [
  "pending",
  "confirmed",
  "rejected",
  "cancelled",
  "expired",
]);

/** Статусы, которые удерживают слот. Должны совпадать с предикатом EXCLUDE-constraint. */
export const HOLDING_STATUSES = ["pending", "confirmed"] as const;

export const resources = pgTable("resources", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  kind: resourceKind("kind").notNull(),

  title: text("title").notNull(),
  subtitle: text("subtitle").notNull(),
  description: text("description").notNull(),
  unitNoun: text("unit_noun").notNull().default("место"),

  /** Часовой пояс отображения. В БД всё хранится в UTC. */
  timezone: text("timezone").notNull().default("Europe/Moscow"),

  priceKind: priceKind("price_kind").notNull(),
  /** Цена в копейках за час или за сеанс — в зависимости от price_kind. */
  priceMinor: integer("price_minor").notNull(),

  /** Шаг сетки слотов. У квеста это длительность сеанса + перерыв. */
  slotStepMin: integer("slot_step_min").notNull(),
  minDurationMin: integer("min_duration_min").notNull(),
  maxDurationMin: integer("max_duration_min").notNull(),
  /** Технический перерыв после брони: уборка, проветривание, сброс квеста. */
  bufferMin: integer("buffer_min").notNull().default(0),

  /** На сколько дней вперёд открыта запись. */
  horizonDays: integer("horizon_days").notNull().default(30),
  /** Минимальный зазор между «сейчас» и началом брони. */
  minLeadMin: integer("min_lead_min").notNull().default(120),
  /** Сколько минут заявка в статусе pending удерживает слот. */
  holdMin: integer("hold_min").notNull().default(30),

  minGuests: integer("min_guests").notNull().default(1),
  maxGuests: integer("max_guests").notNull().default(1),
  /** Спрашивать ли число гостей в форме (для коворкинга — нет). */
  asksGuests: boolean("asks_guests").notNull().default(false),

  sort: integer("sort").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

/**
 * Единица бронирования.
 *
 * У коворкинга это рабочее место, у бани и квеста — одна служебная единица.
 * Единица есть всегда: `bookings.unit_id` не бывает NULL, иначе сравнение
 * `unit_id WITH =` в EXCLUDE-constraint давало бы UNKNOWN и защита от
 * двойной брони не срабатывала бы для ресурсов «целиком».
 */
export const resourceUnits = pgTable(
  "resource_units",
  {
    id: serial("id").primaryKey(),
    resourceId: integer("resource_id")
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    title: text("title").notNull(),
    sort: integer("sort").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [unique("resource_units_resource_code_key").on(t.resourceId, t.code)],
);

/**
 * Часы работы по дням недели.
 *
 * Минуты от полуночи локального дня. `closes_min` больше 1440 означает переход
 * через полночь: у бани 600 → 1560, то есть с 10:00 до 02:00 следующих суток.
 * Нумерация дней как у JS `Date.getDay()`: 0 — воскресенье, 6 — суббота.
 */
export const resourceHours = pgTable(
  "resource_hours",
  {
    id: serial("id").primaryKey(),
    resourceId: integer("resource_id")
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
    weekday: smallint("weekday").notNull(),
    opensMin: integer("opens_min").notNull(),
    closesMin: integer("closes_min").notNull(),
  },
  (t) => [
    unique("resource_hours_resource_weekday_key").on(t.resourceId, t.weekday),
    check("resource_hours_weekday_range", sql`${t.weekday} between 0 and 6`),
    check("resource_hours_order", sql`${t.closesMin} > ${t.opensMin}`),
  ],
);

/** Разовые закрытия: санитарный день, корпоратив, ремонт. */
export const resourceClosures = pgTable(
  "resource_closures",
  {
    id: serial("id").primaryKey(),
    resourceId: integer("resource_id")
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
    /** NULL — закрыт весь ресурс; иначе закрыта одна единица. */
    unitId: integer("unit_id").references(() => resourceUnits.id, { onDelete: "cascade" }),
    period: tstzrange("period").notNull(),
    reason: text("reason").notNull().default(""),
  },
  (t) => [index("resource_closures_resource_idx").on(t.resourceId)],
);

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Короткий код для клиента: ссылка на страницу статуса заявки. */
    publicCode: text("public_code").notNull().unique(),

    resourceId: integer("resource_id")
      .notNull()
      .references(() => resources.id, { onDelete: "restrict" }),
    unitId: integer("unit_id")
      .notNull()
      .references(() => resourceUnits.id, { onDelete: "restrict" }),

    /** Время клиента: его видно в интерфейсе и за него выставлена цена. */
    period: tstzrange("period").notNull(),
    /** period, расширенный на buffer_min в конце. Именно он участвует в EXCLUDE. */
    blockedPeriod: tstzrange("blocked_period").notNull(),

    status: bookingStatus("status").notNull().default("pending"),

    customerName: text("customer_name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    guests: integer("guests").notNull().default(1),
    comment: text("comment"),
    /** Итоговая стоимость в копейках. Считается на сервере, из тела запроса не берётся. */
    priceMinor: integer("price_minor").notNull(),

    telegramMessageId: bigint("telegram_message_id", { mode: "number" }),
    decidedBy: bigint("decided_by", { mode: "number" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    /** До какого момента pending-заявка держит слот. */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("bookings_resource_status_idx").on(t.resourceId, t.status),
    index("bookings_created_idx").on(t.createdAt),
    check("bookings_guests_positive", sql`${t.guests} > 0`),
    check("bookings_price_non_negative", sql`${t.priceMinor} >= 0`),
  ],
);

/**
 * Отметки для rate limit.
 *
 * Сырой IP не храним — только HMAC-хэш с IP_HASH_SALT. Старые строки чистит
 * тот же крон, что переводит просроченные заявки в expired.
 */
export const rateLimitHits = pgTable(
  "rate_limit_hits",
  {
    id: serial("id").primaryKey(),
    ipHash: text("ip_hash").notNull(),
    scope: text("scope").notNull().default("booking"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("rate_limit_hits_lookup_idx").on(t.ipHash, t.scope, t.createdAt)],
);

export type Resource = typeof resources.$inferSelect;
export type ResourceUnit = typeof resourceUnits.$inferSelect;
export type ResourceHours = typeof resourceHours.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type BookingStatus = (typeof bookingStatus.enumValues)[number];
export type ResourceKind = (typeof resourceKind.enumValues)[number];
