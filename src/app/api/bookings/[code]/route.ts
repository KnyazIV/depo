import { NextResponse } from "next/server";

import { getBookingByCode } from "@/domain/booking";
import { isPublicCode } from "@/lib/public-code";

/**
 * Статус заявки по публичному коду.
 *
 * Отдаём только то, что человеку нужно увидеть на своей странице: статус,
 * время и стоимость. Телефон и почту обратно не возвращаем — они уже у него.
 */

export const dynamic = "force-dynamic";

const noStore = { headers: { "Cache-Control": "no-store" } };

export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;

  if (!isPublicCode(code)) {
    return NextResponse.json(
      { error: "not_found", message: "Заявка не найдена" },
      { status: 404, ...noStore },
    );
  }

  const booking = await getBookingByCode(code);

  if (!booking) {
    return NextResponse.json(
      { error: "not_found", message: "Заявка не найдена" },
      { status: 404, ...noStore },
    );
  }

  return NextResponse.json(
    {
      code: booking.publicCode,
      status: booking.status,
      resourceSlug: booking.resourceSlug,
      resourceTitle: booking.resourceTitle,
      unitTitle: booking.unitTitle,
      start: booking.start.toISOString(),
      end: booking.end.toISOString(),
      durationMin: booking.durationMin,
      guests: booking.guests,
      priceMinor: booking.priceMinor,
      expiresAt: booking.expiresAt.toISOString(),
      customerName: booking.customerName,
    },
    noStore,
  );
}
