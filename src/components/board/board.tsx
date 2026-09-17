import Link from "next/link";

import type { Board, BoardRow } from "@/domain/availability";
import { formatPriceRate } from "@/domain/pricing";
import { pluralize } from "@/lib/text";
import { type DateKey, daysBetween, formatDay, formatWeekdayLong, shiftDateKey } from "@/lib/time";

import { HourAxis, HourStrip, StripLegend } from "./hour-strip";

/**
 * Табло.
 *
 * Герой главной — не крупная цифра с подписью, а то, зачем сюда пришли:
 * видно, что свободно, ещё до всякой прокрутки. День листается обычными
 * ссылками: страница и так серверная, клиентский код тут не нужен.
 */

/** Одна строка словами — чтобы смысл полосы не держался на одном цвете. */
function summary(row: BoardRow): string {
  if (!row.isOpenToday) return "в этот день закрыто";

  if (row.freeSlots === 0) {
    // Разные причины: всё разобрали или просто уже поздно записываться.
    return row.hasBusy ? "всё занято" : "запись на этот день закрыта";
  }

  if (row.resource.kind === "seats") {
    return row.unitsFreeNow > 0
      ? `${pluralize(row.unitsFreeNow, "место", "места", "мест")} из ${row.unitsTotal} свободно сейчас`
      : `свободно с ${row.nextFree}`;
  }

  if (row.resource.kind === "sessions") {
    return `${pluralize(row.freeSlots, "сеанс", "сеанса", "сеансов")} свободно, ближайший в ${row.nextFree}`;
  }

  return `свободно с ${row.nextFree}`;
}

/** «Сегодня, 17 сентября», «Завтра, 18 сентября», «пятница, 19 сентября». */
function dateLabel(board: Board): string {
  const offset = daysBetween(board.today, board.date);
  const day = formatDay(board.date, board.timezone, board.today);

  if (offset === 0) return `Сегодня, ${day}`;
  if (offset === 1) return `Завтра, ${day}`;

  return `${formatWeekdayLong(board.date, board.timezone)}, ${day}`;
}

export function TodayBoard({ board }: { board: Board }) {
  const previous = shiftDateKey(board.date, -1);
  const next = shiftDateKey(board.date, 1);

  return (
    <section aria-labelledby="board-heading" className="border-line bg-panel border">
      <div className="border-line flex items-center justify-between gap-3 border-b py-2 pr-2 pl-4">
        <h2 id="board-heading" className="font-display text-ink-soft text-sm">
          {dateLabel(board)}
        </h2>

        <div className="flex items-center gap-1">
          <DayStep
            date={previous}
            disabled={daysBetween(board.today, previous) < 0}
            label="Предыдущий день"
          >
            ‹
          </DayStep>
          <DayStep
            date={next}
            disabled={daysBetween(next, board.lastDate) < 0}
            label="Следующий день"
          >
            ›
          </DayStep>
        </div>
      </div>

      {board.rows.map((row) => (
        <Link
          key={row.resource.slug}
          href={`/${row.resource.slug}?date=${board.date}`}
          data-res={row.resource.slug}
          className="border-line hover:bg-res-wash focus-visible:bg-res-wash block border-b px-4 py-4 transition-colors"
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-display text-lg">{row.resource.title}</span>
            <span className="tnum text-ink-soft shrink-0 text-sm">
              {formatPriceRate(row.resource)}
            </span>
          </div>

          <div className="mt-3">
            <HourStrip cells={row.cells} />
          </div>

          <p className="text-res-ink mt-2 text-sm font-medium">{summary(row)}</p>
        </Link>
      ))}

      <div className="space-y-3 px-4 pt-3 pb-4">
        <HourAxis cells={board.rows[0]?.cells ?? []} />
        <StripLegend />
      </div>
    </section>
  );
}

/** Шаг на день. За границами горизонта — не ссылка, а погашенная стрелка. */
function DayStep({
  date,
  disabled,
  label,
  children,
}: {
  date: DateKey;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const shape =
    "grid size-9 place-items-center rounded-sm border text-lg leading-none transition-colors";

  if (disabled) {
    return (
      <span aria-hidden="true" className={`${shape} border-line text-line-strong`}>
        {children}
      </span>
    );
  }

  return (
    <Link
      href={`/?date=${date}`}
      aria-label={label}
      scroll={false}
      className={`${shape} border-line-strong bg-card hover:border-ink`}
    >
      {children}
    </Link>
  );
}
