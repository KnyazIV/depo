import { NextResponse } from "next/server";

import { type Decision, decideBooking } from "@/domain/booking";
import { CONFIRM_PREFIX, REJECT_PREFIX, updateBookingMessage } from "@/domain/notify";
import { getResourceBySlug } from "@/domain/resources";
import { isConfigured, telegramEnv } from "@/lib/env";
import { answerCallbackQuery } from "@/lib/telegram";

/**
 * Приём нажатий на кнопки в Telegram.
 *
 * Три рубежа защиты:
 *  1. секрет в заголовке X-Telegram-Bot-Api-Secret-Token — адрес вебхука
 *     публичный, и без секрета в него мог бы постучаться кто угодно;
 *  2. whitelist TELEGRAM_ADMIN_IDS — в группе кнопку видят все участники,
 *     а нажимать её имеют право не все;
 *  3. условный UPDATE `where status = 'pending'` — повторное нажатие не
 *     переписывает уже принятое решение.
 *
 * Telegram повторяет доставку, пока не получит 2xx, поэтому на разобранные
 * апдейты всегда отвечаем 200, даже когда делать нечего.
 */

export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ok = () => NextResponse.json({ ok: true });

/**
 * Ответ на нажатие — дело вежливости, а не условие успеха.
 *
 * Если он не уйдёт, а мы отдадим 500, Telegram начнёт повторять апдейт снова
 * и снова, хотя решение уже принято. Поэтому ошибку глушим.
 */
async function ack(options: { id: string; text?: string; alert?: boolean }) {
  try {
    await answerCallbackQuery(options);
  } catch (error) {
    console.error("[telegram] не удалось ответить на нажатие", error);
  }
}

type CallbackQuery = {
  id: string;
  data?: string;
  from?: { id?: number };
};

function parseDecision(data: string): { decision: Decision; bookingId: string } | null {
  if (data.startsWith(CONFIRM_PREFIX)) {
    return { decision: "confirmed", bookingId: data.slice(CONFIRM_PREFIX.length) };
  }
  if (data.startsWith(REJECT_PREFIX)) {
    return { decision: "rejected", bookingId: data.slice(REJECT_PREFIX.length) };
  }
  return null;
}

export async function POST(request: Request) {
  if (!isConfigured(telegramEnv)) {
    return NextResponse.json({ error: "telegram_not_configured" }, { status: 503 });
  }

  const env = telegramEnv();

  if (request.headers.get("x-telegram-bot-api-secret-token") !== env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let update: { callback_query?: CallbackQuery };

  try {
    update = await request.json();
  } catch {
    return ok();
  }

  const query = update.callback_query;
  if (!query) return ok();

  const adminId = query.from?.id;

  if (typeof adminId !== "number" || !env.TELEGRAM_ADMIN_IDS.includes(adminId)) {
    await ack({
      id: query.id,
      text: "Решать по заявкам могут только администраторы",
      alert: true,
    });
    return ok();
  }

  const parsed = parseDecision(query.data ?? "");

  if (!parsed || !UUID_PATTERN.test(parsed.bookingId)) {
    await ack({ id: query.id, text: "Кнопка устарела" });
    return ok();
  }

  const outcome = await decideBooking(parsed.bookingId, parsed.decision, adminId);

  if (!outcome.booking) {
    await ack({ id: query.id, text: "Заявка не найдена", alert: true });
    return ok();
  }

  const booking = outcome.booking;
  const resource = await getResourceBySlug(booking.resourceSlug);

  if (resource) {
    // Сообщение переписываем в обоих случаях: и когда решение принято сейчас,
    // и когда нажали повторно — тогда кнопки просто исчезнут.
    try {
      await updateBookingMessage(
        booking,
        resource,
        outcome.changed ? undefined : "Решение уже было принято раньше.",
      );
    } catch (error) {
      console.error("[telegram] не удалось переписать сообщение", error);
    }
  }

  await ack({
    id: query.id,
    text: outcome.changed
      ? parsed.decision === "confirmed"
        ? "Заявка подтверждена"
        : "Заявка отклонена"
      : "Эта заявка уже обработана",
  });

  return ok();
}
