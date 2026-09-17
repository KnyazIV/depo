import "server-only";

import { telegramEnv } from "./env";

/**
 * Клиент Telegram Bot API на обычном fetch.
 *
 * Библиотека здесь не нужна: используются три метода из трёх, а лишняя
 * зависимость в serverless-функции — это лишний холодный старт.
 */

// Отправка идёт после ответа клиенту (см. after() в route.ts), поэтому
// таймаут можно держать щедрым: лучше дождаться, чем потерять заявку.
const API_TIMEOUT_MS = 20_000;

export class TelegramError extends Error {
  constructor(
    readonly method: string,
    readonly description: string,
  ) {
    super(`Telegram ${method}: ${description}`);
    this.name = "TelegramError";
  }
}

/**
 * Экранирование для parse_mode: HTML.
 *
 * Обязательно для всего, что ввёл человек: имя вроде «Иван <b>» иначе сломает
 * разметку сообщения, а в худшем случае подменит его смысл.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type TelegramResponse<T> = { ok: true; result: T } | { ok: false; description?: string };

async function call<T>(method: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(
    `https://api.telegram.org/bot${telegramEnv().TELEGRAM_BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    },
  );

  const data = (await response.json()) as TelegramResponse<T>;

  if (!data.ok) {
    throw new TelegramError(method, data.description ?? `HTTP ${response.status}`);
  }

  return data.result;
}

export type InlineButton = { text: string; callback_data: string };

export async function sendMessage(options: {
  chatId: string;
  text: string;
  buttons?: InlineButton[][];
}): Promise<{ message_id: number }> {
  return call<{ message_id: number }>("sendMessage", {
    chat_id: options.chatId,
    text: options.text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(options.buttons ? { reply_markup: { inline_keyboard: options.buttons } } : {}),
  });
}

export async function editMessageText(options: {
  chatId: string;
  messageId: number;
  text: string;
  buttons?: InlineButton[][];
}): Promise<void> {
  await call("editMessageText", {
    chat_id: options.chatId,
    message_id: options.messageId,
    text: options.text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: options.buttons ?? [] },
  });
}

export async function answerCallbackQuery(options: {
  id: string;
  text?: string;
  alert?: boolean;
}): Promise<void> {
  await call("answerCallbackQuery", {
    callback_query_id: options.id,
    ...(options.text ? { text: options.text, show_alert: options.alert ?? false } : {}),
  });
}

export async function setWebhook(options: { url: string; secret: string }): Promise<void> {
  await call("setWebhook", {
    url: options.url,
    secret_token: options.secret,
    allowed_updates: ["callback_query"],
    drop_pending_updates: true,
  });
}

export async function getWebhookInfo(): Promise<Record<string, unknown>> {
  return call<Record<string, unknown>>("getWebhookInfo", {});
}
