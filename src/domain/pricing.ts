import type { ResourceConfig } from "./types";

/**
 * Цены.
 *
 * Всё в копейках, чтобы не ловить ошибки округления на дробных часах.
 * Стоимость считается только на сервере — из тела запроса цена не берётся.
 */

export function computePrice(resource: ResourceConfig, durationMin: number): number {
  if (resource.priceKind === "per_session") {
    return resource.priceMinor;
  }

  return Math.round((resource.priceMinor * durationMin) / 60);
}

/**
 * «3 500 ₽».
 *
 * Форматируем вручную, а не через Intl: результат обязан совпасть на сервере и
 * в браузере до символа, иначе React ругается на расхождение при гидратации.
 */
export function formatPrice(minor: number): string {
  const rubles = Math.round(minor / 100);
  const grouped = rubles.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${grouped} ₽`;
}

/** «350 ₽ в час» или «4 500 ₽ за сеанс» — подпись цены на витрине. */
export function formatPriceRate(resource: ResourceConfig): string {
  return resource.priceKind === "per_hour"
    ? `${formatPrice(resource.priceMinor)} в час`
    : `${formatPrice(resource.priceMinor)} за сеанс`;
}
