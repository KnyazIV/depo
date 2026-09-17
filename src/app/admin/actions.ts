"use server";

import { revalidatePath } from "next/cache";

import { type Decision, decideBooking } from "@/domain/booking";
import { updateBookingMessage } from "@/domain/notify";
import { getResourceBySlug } from "@/domain/resources";
import { isConfigured, telegramEnv } from "@/lib/env";
import { site, siteUrl } from "@/lib/site";
import { getWebhookInfo, setWebhook } from "@/lib/telegram";

/**
 * Решение по заявке из админки.
 *
 * Тот же условный UPDATE, что и в вебхуке Telegram: если решение уже принято —
 * там или здесь — второе нажатие ничего не меняет.
 *
 * Доступ к странице закрыт Basic Auth в `proxy.ts`; серверное действие
 * выполняется только после того, как запрос через него прошёл.
 */
export async function decide(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "") as Decision;

  if (!id || (decision !== "confirmed" && decision !== "rejected")) return;

  // 0 — решение принято вручную, а не кнопкой в Telegram.
  const outcome = await decideBooking(id, decision, 0);

  if (outcome.changed && outcome.booking && isConfigured(telegramEnv)) {
    const resource = await getResourceBySlug(outcome.booking.resourceSlug);

    if (resource) {
      try {
        await updateBookingMessage(outcome.booking, resource, "Решение принято в админке.");
      } catch (error) {
        console.error("[telegram] не удалось обновить сообщение из админки", error);
      }
    }
  }

  revalidatePath("/admin");
}

/**
 * Состояние вебхука бота.
 *
 * Telegram доступен не из любой сети, поэтому подписку удобнее делать
 * с сервера, а не локальным скриптом: страница админки уже закрыта Basic Auth
 * в `proxy.ts`, и кнопка здесь безопаснее, чем хождение с токеном в браузере.
 */
export type WebhookState =
  | { configured: false }
  | {
      configured: true;
      url: string;
      expected: string;
      pending: number;
      lastError: string | null;
    }
  | { configured: true; error: string; expected: string };

export async function readWebhookState(): Promise<WebhookState> {
  if (!isConfigured(telegramEnv)) return { configured: false };

  const expected = `${siteUrl()}/api/telegram/webhook`;

  try {
    const info = (await getWebhookInfo()) as {
      url?: string;
      pending_update_count?: number;
      last_error_message?: string;
    };

    return {
      configured: true,
      url: info.url ?? "",
      expected,
      pending: info.pending_update_count ?? 0,
      lastError: info.last_error_message ?? null,
    };
  } catch (error) {
    return {
      configured: true,
      expected,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Подписывает бота на вебхук этого сайта. */
export async function connectBot() {
  if (!isConfigured(telegramEnv)) return;

  const url = `${siteUrl()}/api/telegram/webhook`;

  if (!url.startsWith("https://")) {
    console.error(`[telegram] ${site.name}: вебхук требует https, а адрес ${url}`);
    return;
  }

  try {
    await setWebhook({ url, secret: telegramEnv().TELEGRAM_WEBHOOK_SECRET });
  } catch (error) {
    console.error("[telegram] не удалось подписать бота", error);
  }

  revalidatePath("/admin");
}
