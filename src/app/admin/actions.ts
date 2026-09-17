"use server";

import { revalidatePath } from "next/cache";

import { type Decision, decideBooking } from "@/domain/booking";
import { updateBookingMessage } from "@/domain/notify";
import { getResourceBySlug } from "@/domain/resources";
import { isConfigured, telegramEnv } from "@/lib/env";

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
