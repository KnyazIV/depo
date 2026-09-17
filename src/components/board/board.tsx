import Link from "next/link";

import type { Board, BoardRow } from "@/domain/availability";
import { formatPriceRate } from "@/domain/pricing";
import { formatDay } from "@/lib/time";
import { pluralize } from "@/lib/text";

import { HourAxis, HourStrip, StripLegend } from "./hour-strip";

/**
 * Табло на сегодня.
 *
 * Герой главной — не крупная цифра с подписью, а то, зачем сюда пришли:
 * видно, что свободно прямо сейчас, ещё до всякой прокрутки.
 */

/** Одна строка словами — чтобы смысл полосы не держался на одном цвете. */
function summary(row: BoardRow): string {
  if (!row.isOpenToday) return "сегодня закрыто";

  if (row.freeSlots === 0) {
    // Разные причины: всё разобрали или просто уже поздно записываться.
    return row.hasBusy ? "на сегодня всё занято" : "на сегодня запись закрыта";
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

export function TodayBoard({ board }: { board: Board }) {
  return (
    <section aria-labelledby="board-heading" className="border-line bg-panel border">
      <h2
        id="board-heading"
        className="border-line font-display text-ink-soft border-b px-4 py-3 text-sm"
      >
        Сегодня, {formatDay(board.date, board.timezone, board.date)}
      </h2>

      {board.rows.map((row) => (
        <Link
          key={row.resource.slug}
          href={`/${row.resource.slug}`}
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
