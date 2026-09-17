import "server-only";

import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";

import { dbEnv } from "@/lib/env";

import * as schema from "./schema";

/**
 * Подключение к базе.
 *
 * Один драйвер — HTTP: каждый запрос это один round-trip, без установки
 * соединения и без WebSocket. Для serverless это самый дешёвый вариант,
 * а холодный старт не платит за рукопожатие.
 *
 * Интерактивные транзакции HTTP-драйвер не умеет, и они здесь не нужны:
 * бронь вставляется одним оператором, атомарность которого обеспечивает сам
 * Postgres (см. `domain/booking.ts`).
 */

type Db = NeonHttpDatabase<typeof schema>;

// Переживает горячие вызовы serverless-функции.
const cache = globalThis as unknown as { __depoDb?: Db };

export function db(): Db {
  cache.__depoDb ??= drizzle({
    client: neon(dbEnv().DATABASE_URL),
    schema,
    casing: "snake_case",
  });
  return cache.__depoDb;
}

/** Код нарушения EXCLUDE-constraint в Postgres. */
export const EXCLUSION_VIOLATION = "23P01";

/** Сработал ли constraint на пересечение броней. */
export function isSlotConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  return (error as { code?: unknown }).code === EXCLUSION_VIOLATION;
}

/**
 * Сетевой сбой, а не отказ базы.
 *
 * Запрос до Postgres не дошёл или ответ не вернулся: TLS-соединение оборвали,
 * вышел таймаут, DNS не отозвался. Такие ошибки имеет смысл повторить, в
 * отличие от ошибок самого Postgres — те надо чинить.
 */
export function isTransientError(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;

  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);

    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && TRANSIENT_CODES.has(code)) return true;

    const message = (current as { message?: unknown }).message;
    if (typeof message === "string" && /fetch failed|socket hang up/i.test(message)) return true;

    current =
      (current as { cause?: unknown }).cause ?? (current as { sourceError?: unknown }).sourceError;
  }

  return false;
}

const TRANSIENT_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
  "EAI_AGAIN",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
]);

/**
 * Повтор идемпотентного запроса при сетевом сбое.
 *
 * Годится только для чтения и для операций, которые можно безопасно
 * выполнить дважды. Вставка брони этим не пользуется — у неё свой путь,
 * см. `domain/booking.ts`.
 */
export async function retryTransient<T>(run: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= attempts || !isTransientError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
    }
  }
}

export { schema };
