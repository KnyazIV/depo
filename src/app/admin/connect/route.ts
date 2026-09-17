import { NextResponse } from "next/server";

import { isConfigured, telegramEnv } from "@/lib/env";
import { siteUrl } from "@/lib/site";
import { setWebhook } from "@/lib/telegram";

/**
 * Подписка бота на вебхук этого сайта.
 *
 * Лежит под `/admin`, поэтому уже закрыт Basic Auth из `proxy.ts` — отдельной
 * защиты не нужно. Запрос к Telegram уходит с сервера: локальная машина до
 * api.telegram.org может и не дотянуться, а Vercel дотянется.
 *
 * Одна реализация на два случая: кнопка в админке шлёт сюда обычную форму,
 * а после смены домена то же самое дёргается скриптом.
 */

export const dynamic = "force-dynamic";

export async function POST() {
  const back = new URL("/admin", siteUrl());

  if (!isConfigured(telegramEnv)) {
    return NextResponse.json(
      { error: "telegram_not_configured", message: "Переменные TELEGRAM_* не заданы" },
      { status: 503 },
    );
  }

  const url = `${siteUrl()}/api/telegram/webhook`;

  if (!url.startsWith("https://")) {
    return NextResponse.json(
      { error: "https_required", message: `Telegram требует https, а адрес ${url}` },
      { status: 400 },
    );
  }

  try {
    await setWebhook({ url, secret: telegramEnv().TELEGRAM_WEBHOOK_SECRET });
  } catch (error) {
    console.error("[telegram] не удалось подписать бота", error);
    return NextResponse.json(
      {
        error: "telegram_failed",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }

  // 303 — чтобы браузер после формы ушёл на страницу обычным GET.
  return NextResponse.redirect(back, 303);
}
