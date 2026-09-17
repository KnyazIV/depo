"use client";

import { useEffect } from "react";

import { site } from "@/lib/site";

/**
 * Экран на случай, когда база или сеть недоступны.
 *
 * Бронирование — не то место, где человека можно оставить с пустой страницей:
 * если сайт не работает, он должен сразу увидеть телефон.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[page]", error);
  }, [error]);

  return (
    <main className="mx-auto max-w-xl px-4 py-20">
      <h1 className="font-display text-[clamp(2rem,8vw,3rem)] leading-tight">
        Расписание не загрузилось
      </h1>
      <p className="text-ink-soft mt-4 leading-relaxed">
        Что-то сломалось на нашей стороне. Попробуйте обновить страницу — или позвоните, мы
        забронируем время вручную.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
        <button
          type="button"
          onClick={reset}
          className="border-ink hover:bg-ink hover:text-paper border px-5 py-3 font-medium transition-colors"
        >
          Обновить
        </button>
        <a
          href={`tel:${site.phone.replace(/[^\d+]/g, "")}`}
          className="tnum decoration-line hover:decoration-ink text-lg underline underline-offset-4"
        >
          {site.phone}
        </a>
      </div>
    </main>
  );
}
