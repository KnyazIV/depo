import type { HourCell } from "@/domain/slots";

/**
 * Полоса часов.
 *
 * Одна колонка — один час. Полосы разных ресурсов лежат на общей оси, поэтому
 * их можно сравнивать взглядом, не читая подписи.
 */
export function HourStrip({ cells, height = "h-8" }: { cells: HourCell[]; height?: string }) {
  return (
    <div className={`hour-strip ${height}`} aria-hidden="true">
      {cells.map((cell) => (
        <div key={cell.offsetMin} className="hour-cell" data-state={cell.state} />
      ))}
    </div>
  );
}

/** Ось под полосами: подпись через час, чтобы цифры не наезжали друг на друга. */
export function HourAxis({ cells }: { cells: HourCell[] }) {
  return (
    <div className="hour-strip tnum text-ink-soft text-[11px]" aria-hidden="true">
      {cells.map((cell, index) => (
        <div key={cell.offsetMin} className="text-center">
          {index % 2 === 0 ? cell.label : ""}
        </div>
      ))}
    </div>
  );
}

export function StripLegend() {
  const items = [
    { state: "free", label: "свободно" },
    { state: "busy", label: "занято" },
    { state: "past", label: "прошло" },
    { state: "closed", label: "закрыто" },
  ];

  return (
    <ul className="text-ink-soft flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {items.map((item) => (
        <li key={item.state} className="flex items-center gap-1.5">
          <span className="hour-cell size-3" data-state={item.state} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
