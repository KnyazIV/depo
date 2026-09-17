import "server-only";

import { createHmac } from "node:crypto";

import { and, eq, gt, lt, sql } from "drizzle-orm";

import { db, retryTransient } from "@/db/client";
import { rateLimitHits } from "@/db/schema";

import { ipSaltEnv } from "./env";

/**
 * Ограничение частоты заявок.
 *
 * Хранилище — таблица в Postgres, а не Upstash: база уже есть и уже на горячем
 * пути запроса, лишний вендор и лишний сетевой хоп не окупаются, а объём здесь
 * измеряется единицами запросов в минуту. Если когда-нибудь понадобится лимит
 * на уровне proxy.ts или тысячи RPS — меняется только это тело функции.
 *
 * Сырой IP не сохраняем: в таблице лежит HMAC-хэш. Это меньше персональных
 * данных на руках и ровно столько, сколько нужно для счётчика.
 */

export const BOOKING_LIMIT = { limit: 5, windowMin: 10, scope: "booking" } as const;

export function hashIp(ip: string): string {
  return createHmac("sha256", ipSaltEnv().IP_HASH_SALT).update(ip).digest("hex");
}

/** IP клиента за прокси Vercel. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers.get("x-real-ip") ?? "unknown";
}

export type RateLimitVerdict = { allowed: true } | { allowed: false; retryAfterSec: number };

export async function checkRateLimit(
  ipHash: string,
  options: { limit: number; windowMin: number; scope: string } = BOOKING_LIMIT,
): Promise<RateLimitVerdict> {
  const database = db();
  const windowStart = sql`now() - ${`${options.windowMin} minutes`}::interval`;

  const [summary] = await retryTransient(() =>
    database
      .select({
        hits: sql<number>`count(*)::int`,
        oldest: sql<string | null>`min(${rateLimitHits.createdAt})`,
      })
      .from(rateLimitHits)
      .where(
        and(
          eq(rateLimitHits.ipHash, ipHash),
          eq(rateLimitHits.scope, options.scope),
          gt(rateLimitHits.createdAt, windowStart),
        ),
      ),
  );

  if (summary && summary.hits >= options.limit && summary.oldest) {
    const freeAt = new Date(summary.oldest).getTime() + options.windowMin * 60_000;
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((freeAt - Date.now()) / 1000)),
    };
  }

  // Отметку ставим на любую попытку, включая неудачную: иначе бот мог бы
  // бесплатно долбиться в занятые слоты.
  await retryTransient(() =>
    database.insert(rateLimitHits).values({ ipHash, scope: options.scope }),
  );

  return { allowed: true };
}

/** Чистка старых отметок. Вызывается тем же кроном, что гасит заявки. */
export async function cleanupRateLimitHits(): Promise<number> {
  const removed = await retryTransient(() =>
    db()
      .delete(rateLimitHits)
      .where(lt(rateLimitHits.createdAt, sql`now() - interval '1 day'`))
      .returning({ id: rateLimitHits.id }),
  );

  return removed.length;
}
