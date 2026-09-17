import "server-only";

import { z } from "zod";

/**
 * Переменные окружения.
 *
 * Проверка ленивая и разбита на группы: `next build` не должен падать из-за
 * отсутствующего токена Telegram, а эндпоинт доступности не должен требовать
 * CRON_SECRET. Каждая группа парсится один раз при первом обращении.
 */

const dbSchema = z.object({
  DATABASE_URL: z
    .string({ error: "DATABASE_URL не задан — возьмите строку подключения в Neon" })
    .min(1, "DATABASE_URL не задан — возьмите строку подключения в Neon")
    .refine(
      (value) => value.startsWith("postgres://") || value.startsWith("postgresql://"),
      "DATABASE_URL должен начинаться с postgres:// или postgresql://",
    ),
});

const telegramSchema = z.object({
  TELEGRAM_BOT_TOKEN: z
    .string({ error: "TELEGRAM_BOT_TOKEN не задан — получите его у @BotFather" })
    .min(1, "TELEGRAM_BOT_TOKEN не задан — получите его у @BotFather"),
  TELEGRAM_ADMIN_CHAT_ID: z
    .string({ error: "TELEGRAM_ADMIN_CHAT_ID не задан" })
    .min(1, "TELEGRAM_ADMIN_CHAT_ID не задан — это id чата или группы администраторов"),
  TELEGRAM_WEBHOOK_SECRET: z
    .string({ error: "TELEGRAM_WEBHOOK_SECRET не задан" })
    .min(16, "TELEGRAM_WEBHOOK_SECRET должен быть не короче 16 символов"),
  TELEGRAM_ADMIN_IDS: z
    .string({ error: "TELEGRAM_ADMIN_IDS не задан" })
    .min(1, "TELEGRAM_ADMIN_IDS не задан — перечислите id админов через запятую")
    .transform((value, ctx) => {
      const ids = value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .map(Number);

      if (ids.length === 0 || ids.some((id) => !Number.isInteger(id))) {
        ctx.addIssue({
          code: "custom",
          message: "TELEGRAM_ADMIN_IDS должен быть списком числовых id через запятую",
        });
        return z.NEVER;
      }

      return ids;
    }),
});

// Секреты разнесены по одному, чтобы отсутствие пароля админки не ломало
// приём заявок, а отсутствие соли — крон.
const cronSchema = z.object({
  CRON_SECRET: z
    .string({ error: "CRON_SECRET не задан" })
    .min(16, "CRON_SECRET должен быть не короче 16 символов"),
});

const adminSchema = z.object({
  ADMIN_PASSWORD: z
    .string({ error: "ADMIN_PASSWORD не задан" })
    .min(8, "ADMIN_PASSWORD должен быть не короче 8 символов"),
});

const ipSaltSchema = z.object({
  IP_HASH_SALT: z
    .string({ error: "IP_HASH_SALT не задан" })
    .min(16, "IP_HASH_SALT должен быть не короче 16 символов"),
});

function parse<T extends z.ZodType>(schema: T, group: string): z.output<T> {
  const result = schema.safeParse(process.env);

  if (!result.success) {
    const details = result.error.issues.map((issue) => `  · ${issue.message}`).join("\n");
    throw new Error(`Не настроено окружение (${group}):\n${details}`);
  }

  return result.data;
}

function once<T>(factory: () => T): () => T {
  let cached: { value: T } | null = null;
  return () => {
    cached ??= { value: factory() };
    return cached.value;
  };
}

export const dbEnv = once(() => parse(dbSchema, "база данных"));
export const telegramEnv = once(() => parse(telegramSchema, "Telegram"));
export const cronEnv = once(() => parse(cronSchema, "крон"));
export const adminEnv = once(() => parse(adminSchema, "админка"));
export const ipSaltEnv = once(() => parse(ipSaltSchema, "rate limit"));

/** Настроена ли группа переменных. Нужно там, где отсутствие настройки — не авария. */
export function isConfigured(group: () => unknown): boolean {
  try {
    group();
    return true;
  } catch {
    return false;
  }
}

export const isProduction = () => process.env.NODE_ENV === "production";
