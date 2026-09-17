import { z } from "zod";

import type { ResourceConfig } from "@/domain/types";

/**
 * Схемы заявки.
 *
 * Один файл на клиент и на сервер: форма и API-обработчик проверяют данные
 * одними и теми же правилами, поэтому «на клиенте прошло, на сервере упало»
 * случиться не может. Серверная проверка при этом остаётся обязательной —
 * запрос легко отправить в обход формы.
 */

export const PHONE_PATTERN = /^\+7[3-9]\d{9}$/;

/** Любой человеческий ввод → `+7XXXXXXXXXX`. */
export function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");

  if (digits.length === 11 && (digits.startsWith("8") || digits.startsWith("7"))) {
    digits = digits.slice(1);
  }

  return `+7${digits}`;
}

/** `+7 (901) 234-56-78` — то, что видно в поле ввода. */
export function formatPhoneMask(raw: string): string {
  let digits = raw.replace(/\D/g, "");

  if (digits.startsWith("8") || digits.startsWith("7")) {
    digits = digits.slice(1);
  }
  digits = digits.slice(0, 10);

  if (digits.length === 0) return "+7 ";

  const parts = [
    digits.slice(0, 3),
    digits.slice(3, 6),
    digits.slice(6, 8),
    digits.slice(8, 10),
  ].filter(Boolean);

  let result = `+7 (${parts[0]}`;
  if (digits.length >= 3) result += ")";
  if (parts[1]) result += ` ${parts[1]}`;
  if (parts[2]) result += `-${parts[2]}`;
  if (parts[3]) result += `-${parts[3]}`;

  return result;
}

const nameSchema = z
  .string()
  .trim()
  .min(2, "Напишите, как к вам обращаться")
  .max(80, "Слишком длинное имя");

const phoneSchema = z
  .string()
  .trim()
  .min(1, "Без телефона администратор не сможет перезвонить")
  .transform(normalizePhone)
  .refine((value) => PHONE_PATTERN.test(value), "Похоже, в номере опечатка");

const emailSchema = z
  .string()
  .trim()
  .max(120)
  .refine((value) => value === "" || z.email().safeParse(value).success, "Проверьте адрес почты")
  .transform((value) => (value === "" ? null : value.toLowerCase()))
  .nullable()
  .optional();

const commentSchema = z
  .string()
  .trim()
  .max(500, "Не больше 500 символов")
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .optional();

/**
 * Тело запроса `POST /api/bookings`.
 *
 * Цены здесь нет намеренно: её считает сервер по настройкам ресурса из базы.
 */
export const bookingRequestSchema = z.object({
  slug: z.string().trim().min(1),
  /** Начало брони, ISO в UTC. */
  start: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), "Не удалось разобрать время начала"),
  durationMin: z
    .number()
    .int()
    .positive()
    .max(24 * 60),
  /** Конкретная единица или null — «любая свободная». */
  unitId: z.number().int().positive().nullable().optional(),

  name: nameSchema,
  phone: phoneSchema,
  email: emailSchema,
  guests: z.number().int().min(1).max(100),
  comment: commentSchema,

  consent: z.literal(true, {
    error: "Без согласия на обработку данных заявку принять нельзя",
  }),

  /** Ловушка для ботов: люди это поле не видят и не заполняют. */
  website: z.string().max(0).optional().default(""),
});

export type BookingRequest = z.input<typeof bookingRequestSchema>;
export type BookingRequestParsed = z.output<typeof bookingRequestSchema>;

/**
 * Схема формы. Диапазон гостей зависит от ресурса, поэтому собирается на лету.
 */
export function makeBookingFormSchema(resource: ResourceConfig) {
  return z.object({
    name: nameSchema,
    phone: phoneSchema,
    email: z.string().trim().max(120).optional().default(""),
    guests: resource.asksGuests
      ? z
          .number()
          .int()
          .min(resource.minGuests, `Минимум ${resource.minGuests}`)
          .max(resource.maxGuests, `Максимум ${resource.maxGuests}`)
      : z.number().int().default(1),
    comment: z.string().trim().max(500, "Не больше 500 символов").optional().default(""),
    consent: z.literal(true, {
      error: "Без согласия на обработку данных заявку принять нельзя",
    }),
    website: z.string().max(0).optional().default(""),
  });
}

export type BookingFormValues = z.input<ReturnType<typeof makeBookingFormSchema>>;

/** Ошибки полей в виде `{ поле: сообщение }` — в таком виде их ждёт форма. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};

  for (const issue of error.issues) {
    const field = issue.path[0];
    // Первое сообщение на поле — остальные человеку уже не помогут.
    if (typeof field === "string" && !(field in result)) {
      result[field] = issue.message;
    }
  }

  return result;
}
