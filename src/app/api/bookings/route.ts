import { NextResponse, after } from "next/server";

import { createBooking, getResourceForBooking, saveTelegramMessageId } from "@/domain/booking";
import { notifyNewBooking } from "@/domain/notify";
import { ipSaltEnv, isConfigured, isProduction, telegramEnv } from "@/lib/env";
import { BOOKING_LIMIT, checkRateLimit, clientIp, hashIp } from "@/lib/rate-limit";
import { bookingRequestSchema, fieldErrors } from "@/lib/validation/booking";

/**
 * Создание заявки.
 *
 * Порядок важен: сначала дешёвые проверки (разбор тела, Zod, ловушка для
 * ботов), потом лимит по IP, и только потом транзакция с вставкой. Занятость
 * решает EXCLUDE-constraint, поэтому «свободно ли время» здесь не спрашиваем —
 * между вопросом и вставкой всё равно успел бы вклиниться другой запрос.
 */

export const dynamic = "force-dynamic";

const noStore = { headers: { "Cache-Control": "no-store" } };

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "bad_json", message: "Не удалось прочитать запрос" },
      { status: 400, ...noStore },
    );
  }

  const parsed = bookingRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "validation_failed",
        message: "Проверьте поля формы",
        fields: fieldErrors(parsed.error),
      },
      { status: 422, ...noStore },
    );
  }

  const data = parsed.data;

  const resource = await getResourceForBooking(data.slug);

  if (!resource) {
    return NextResponse.json(
      { error: "resource_not_found", message: "Такого ресурса нет" },
      { status: 404, ...noStore },
    );
  }

  // Лимит по IP. В проде отсутствие соли — авария конфигурации, локально же
  // не хочется требовать все секреты только ради того, чтобы нажать «отправить».
  if (isConfigured(ipSaltEnv)) {
    const verdict = await checkRateLimit(hashIp(clientIp(request.headers)));

    if (!verdict.allowed) {
      return NextResponse.json(
        {
          error: "rate_limited",
          message: `Слишком много заявок подряд. Попробуйте через ${Math.ceil(verdict.retryAfterSec / 60)} мин или позвоните нам`,
        },
        {
          status: 429,
          headers: { "Cache-Control": "no-store", "Retry-After": String(verdict.retryAfterSec) },
        },
      );
    }
  } else if (isProduction()) {
    console.error("[rate-limit] IP_HASH_SALT не задан — приём заявок остановлен");
    return NextResponse.json(
      { error: "misconfigured", message: "Сайт настраивается, попробуйте позже" },
      { status: 503, ...noStore },
    );
  } else {
    console.warn(
      `[rate-limit] IP_HASH_SALT не задан — лимит ${BOOKING_LIMIT.limit}/10 мин отключён`,
    );
  }

  const outcome = await createBooking({
    resource,
    start: new Date(data.start),
    durationMin: data.durationMin,
    unitId: data.unitId ?? null,
    name: data.name,
    phone: data.phone,
    email: data.email ?? null,
    guests: data.guests,
    comment: data.comment ?? null,
  });

  if (!outcome.ok) {
    return NextResponse.json(
      { error: outcome.code, message: outcome.message },
      { status: outcome.code === "slot_taken" ? 409 : 422, ...noStore },
    );
  }

  const booking = outcome.booking;

  // Telegram уходит после ответа: человек не должен ждать чужой API, чтобы
  // увидеть «заявка принята». Если бот недоступен, бронь не трогаем — она уже
  // принята и видна в админке, администратор возьмёт её оттуда.
  if (isConfigured(telegramEnv)) {
    after(async () => {
      const messageId = await notifyNewBooking(booking, resource);
      if (messageId !== null) {
        await saveTelegramMessageId(booking.id, messageId);
      }
    });
  } else {
    console.warn("[telegram] бот не настроен — заявка", booking.publicCode, "только в админке");
  }

  return NextResponse.json(
    {
      code: booking.publicCode,
      status: booking.status,
      start: booking.start.toISOString(),
      end: booking.end.toISOString(),
      durationMin: booking.durationMin,
      priceMinor: booking.priceMinor,
      expiresAt: booking.expiresAt.toISOString(),
    },
    { status: 201, ...noStore },
  );
}
