"use client";

import type { SlotView } from "@/domain/types";

/**
 * Сетка слотов — главный инструмент страницы.
 *
 * Ячейка не карточка: у неё нет тени и скруглений «как у всего остального».
 * Состояние читается заливкой и насыщенностью текста, а для тех, кто цвет не
 * различает, у каждой недоступной ячейки есть словесная подпись.
 *
 * Недоступные ячейки залиты цветом бумаги, а не прозрачны: сквозь прозрачные
 * просвечивала фоновая штриховка и сетка начинала рябить.
 */

const STATE_HINT: Record<string, string> = {
  busy: "занято",
  past: "уже прошло",
  closed: "закрыто",
};

export function SlotGrid({
  slots,
  value,
  busy,
  onChange,
}: {
  slots: SlotView[];
  value: string | null;
  busy: boolean;
  onChange: (start: string) => void;
}) {
  return (
    <div
      className={`grid grid-cols-3 gap-1.5 transition-opacity sm:grid-cols-5 ${busy ? "opacity-40" : ""}`}
      role="group"
      aria-label="Выбор времени"
      aria-busy={busy}
    >
      {slots.map((slot) => {
        const selected = slot.start === value;
        const free = slot.state === "free";

        return (
          <button
            key={slot.start}
            type="button"
            disabled={!free}
            onClick={() => onChange(slot.start)}
            aria-pressed={selected}
            className={`tnum rounded-sm border py-3 text-base font-medium transition-colors ${
              selected
                ? "border-res bg-res text-white"
                : free
                  ? "border-line-strong bg-card text-ink hover:border-res hover:text-res-ink"
                  : "border-line bg-paper text-busy"
            }`}
          >
            {slot.label}
            {!free && <span className="sr-only"> — {STATE_HINT[slot.state]}</span>}
          </button>
        );
      })}
    </div>
  );
}
