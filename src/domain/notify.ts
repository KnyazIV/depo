import "server-only";

import { telegramEnv } from "@/lib/env";
import { type InlineButton, editMessageText, escapeHtml, sendMessage } from "@/lib/telegram";
import { formatDateTime, formatDuration, formatTime } from "@/lib/time";
import { formatPhoneMask } from "@/lib/validation/booking";

import type { BookingSummary } from "./booking";
import { formatPrice } from "./pricing";
import type { ResourceConfig } from "./types";

/** Сообщение администратору и кнопки решения. */

export const CONFIRM_PREFIX = "ok:";
export const REJECT_PREFIX = "no:";

export function decisionButtons(bookingId: string): InlineButton[][] {
  return [
    [
      { text: "✅ Подтвердить", callback_data: `${CONFIRM_PREFIX}${bookingId}` },
      { text: "❌ Отклонить", callback_data: `${REJECT_PREFIX}${bookingId}` },
    ],
  ];
}

const HEADINGS = {
  pending: "🆕 Новая заявка",
  confirmed: "✅ Подтверждено",
  rejected: "❌ Отклонено",
  cancelled: "🚫 Отменено",
  expired: "⌛ Заявка просрочена",
} as const;

/**
 * Текст заявки.
 *
 * Всё, что ввёл человек, проходит через escapeHtml: имя вида «Иван <b>» иначе
 * сломало бы разметку сообщения.
 */
export function bookingMessage(booking: BookingSummary, resource: ResourceConfig): string {
  const tz = resource.timezone;

  const lines = [
    `${HEADINGS[booking.status]} — ${escapeHtml(booking.resourceTitle)}`,
    "",
    `<b>Когда:</b> ${formatDateTime(booking.start, tz)} – ${formatTime(booking.end, tz)} (${formatDuration(booking.durationMin)})`,
  ];

  if (resource.kind === "seats") {
    lines.push(`<b>Место:</b> ${escapeHtml(booking.unitTitle)}`);
  }

  if (resource.asksGuests) {
    lines.push(`<b>Гостей:</b> ${booking.guests}`);
  }

  lines.push(
    `<b>Стоимость:</b> ${formatPrice(booking.priceMinor)}`,
    "",
    `<b>Имя:</b> ${escapeHtml(booking.customerName)}`,
    `<b>Телефон:</b> ${escapeHtml(formatPhoneMask(booking.phone))}`,
  );

  if (booking.email) {
    lines.push(`<b>Почта:</b> ${escapeHtml(booking.email)}`);
  }

  if (booking.comment) {
    lines.push(`<b>Комментарий:</b> ${escapeHtml(booking.comment)}`);
  }

  lines.push("", `Код заявки: <code>${escapeHtml(booking.publicCode)}</code>`);

  if (booking.status === "pending") {
    lines.push(`Слот держится до ${formatTime(booking.expiresAt, tz)}`);
  }

  return lines.join("\n");
}

/**
 * Отправка заявки администратору.
 *
 * Возвращает message_id или null. Ошибку наружу не бросаем: Telegram может
 * лежать, а бронь при этом уже создана и обязана остаться видимой в админке.
 */
export async function notifyNewBooking(
  booking: BookingSummary,
  resource: ResourceConfig,
): Promise<number | null> {
  try {
    const { message_id } = await sendMessage({
      chatId: telegramEnv().TELEGRAM_ADMIN_CHAT_ID,
      text: bookingMessage(booking, resource),
      buttons: decisionButtons(booking.id),
    });

    return message_id;
  } catch (error) {
    console.error("[telegram] заявка не ушла администратору", {
      bookingId: booking.id,
      publicCode: booking.publicCode,
      error: error instanceof Error ? error.message : error,
    });
    return null;
  }
}

/** Переписывает сообщение после решения и убирает кнопки. */
export async function updateBookingMessage(
  booking: BookingSummary,
  resource: ResourceConfig,
  footer?: string,
): Promise<void> {
  if (booking.telegramMessageId === null) return;

  const text = footer
    ? `${bookingMessage(booking, resource)}\n${escapeHtml(footer)}`
    : bookingMessage(booking, resource);

  await editMessageText({
    chatId: telegramEnv().TELEGRAM_ADMIN_CHAT_ID,
    messageId: booking.telegramMessageId,
    text,
  });
}
