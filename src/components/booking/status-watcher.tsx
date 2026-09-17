"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Живой статус заявки.
 *
 * Пока заявка в ожидании, страница тихо перечитывает статус: администратор
 * нажимает кнопку в Telegram, и человеку не нужно обновлять вкладку вручную.
 * Как только решение принято, опрос прекращается.
 */
export function StatusWatcher({ code, status }: { code: string; status: string }) {
  const router = useRouter();

  useEffect(() => {
    if (status !== "pending") return;

    let stopped = false;

    const check = async () => {
      if (document.visibilityState !== "visible") return;

      try {
        const response = await fetch(`/api/bookings/${code}`, { cache: "no-store" });
        if (!response.ok) return;

        const payload: { status: string } = await response.json();
        if (!stopped && payload.status !== status) router.refresh();
      } catch {
        // Молча: связь пропала, следующая попытка через 15 секунд.
      }
    };

    const timer = setInterval(check, 15_000);
    document.addEventListener("visibilitychange", check);

    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [code, status, router]);

  return null;
}
