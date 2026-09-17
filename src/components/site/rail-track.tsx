/**
 * Рельсовый путь.
 *
 * Идёт вертикально через всю страницу: колея проходит по бокам от контента,
 * шпалы уходят под него и за края экрана. Виджеты в итоге едут по путям —
 * для бывшего депо это честнее любого абстрактного узора.
 *
 * Не фон страницы, а закреплённый слой под содержимым: фоном не получалось —
 * контент заполняет экран целиком и всегда оказывался сверху. Ширина совпадает
 * с колонкой контента, поэтому рельсы всегда ложатся вплотную к панелям и на
 * телефоне, и на широком экране.
 */
export function RailTrack() {
  return (
    <div
      aria-hidden="true"
      className="rail-track pointer-events-none fixed inset-y-0 left-1/2 z-0 w-full max-w-3xl -translate-x-1/2"
    >
      <div className="rail-sleepers" />
      <div className="rail-line rail-line-left" />
      <div className="rail-line rail-line-right" />
    </div>
  );
}
