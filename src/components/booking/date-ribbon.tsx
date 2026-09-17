"use client";

import { useEffect, useRef } from "react";

import { type DateKey, formatWeekdayShort } from "@/lib/time";

/**
 * Лента дат.
 *
 * Горизонтальная прокрутка вместо календарной сетки: на телефоне выбрать
 * ближайшие дни большим пальцем быстрее, чем целиться в клетку месяца.
 */
export function DateRibbon({
  dates,
  value,
  timezone,
  onChange,
}: {
  dates: DateKey[];
  value: DateKey;
  timezone: string;
  onChange: (date: DateKey) => void;
}) {
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [value]);

  return (
    <div className="-mx-4 [scrollbar-width:none] overflow-x-auto px-4 [&::-webkit-scrollbar]:hidden">
      <div className="flex gap-1.5 pb-1" role="group" aria-label="Выбор даты">
        {dates.map((date) => {
          const selected = date === value;

          return (
            <button
              key={date}
              ref={selected ? selectedRef : undefined}
              type="button"
              onClick={() => onChange(date)}
              aria-pressed={selected}
              className={`min-w-14 shrink-0 rounded-sm border px-2 py-2 text-center transition-colors ${
                selected
                  ? "border-res bg-res text-white"
                  : "border-line bg-card text-ink hover:border-line-strong"
              }`}
            >
              <span className="block text-xs opacity-80">{formatWeekdayShort(date, timezone)}</span>
              <span className="tnum block text-lg leading-tight font-medium">
                {Number(date.slice(8, 10))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
