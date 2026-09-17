import { NextResponse } from "next/server";

import { expireStaleBookings } from "@/domain/booking";
import { cronEnv } from "@/lib/env";
import { cleanupRateLimitHits } from "@/lib/rate-limit";

/**
 * Подметание просроченных заявок.
 *
 * Vercel Cron дёргает этот адрес раз в пять минут и сам подставляет
 * `Authorization: Bearer $CRON_SECRET`.
 *
 * Календарь на крон не полагается: выдача доступности и так отсекает
 * протухшие холды по `expires_at`. Крон нужен, чтобы статусы в админке
 * отражали реальность и таблица не копила мусор.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${cronEnv().CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [expired, cleaned] = await Promise.all([expireStaleBookings(), cleanupRateLimitHits()]);

  return NextResponse.json({ expired, cleaned }, { headers: { "Cache-Control": "no-store" } });
}
