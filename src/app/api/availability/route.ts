import { NextResponse } from "next/server";

import { getDayAvailability } from "@/domain/availability";
import { getResourceBySlug, listResources } from "@/domain/resources";
import type { AvailabilityResponse } from "@/domain/types";
import { isDateKey, utcToDateKey } from "@/lib/time";

/**
 * Занятость ресурса на дату.
 *
 * `GET /api/availability?slug=banya&date=2026-09-17`
 * Вместо slug можно передать resourceId.
 *
 * В ответе только состояния слотов и свободные единицы. Ни имён, ни телефонов,
 * ни комментариев чужих броней здесь нет и быть не должно.
 */

export const dynamic = "force-dynamic";

const noStore = { headers: { "Cache-Control": "no-store" } };

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const slug = params.get("slug");
  const resourceId = params.get("resourceId");

  const resource = slug
    ? await getResourceBySlug(slug)
    : resourceId
      ? ((await listResources()).find((item) => item.id === Number(resourceId)) ?? null)
      : null;

  if (!resource) {
    return NextResponse.json(
      { error: "resource_not_found", message: "Такого ресурса нет" },
      { status: 404, ...noStore },
    );
  }

  const now = new Date();
  const date = params.get("date") ?? utcToDateKey(now, resource.timezone);

  if (!isDateKey(date)) {
    return NextResponse.json(
      { error: "bad_date", message: "Дата должна быть в формате ГГГГ-ММ-ДД" },
      { status: 400, ...noStore },
    );
  }

  const availability = await getDayAvailability(resource, date, now);
  const payload: AvailabilityResponse = { resource, availability };

  return NextResponse.json(payload, noStore);
}
