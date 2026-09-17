/**
 * Контакты и реквизиты комплекса.
 *
 * Всё, что нужно поменять при запуске на реального клиента, лежит здесь —
 * в коде страниц захардкоженных телефонов и адресов нет.
 */
export const site = {
  name: "Депо",
  legalName: "ИП Иванов И. И. (ИНН 000000000000)", // TODO: заменить на реальные реквизиты
  tagline: "Коворкинг, баня и квест — по часам",
  description:
    "Бронирование коворкинга, бани и квест-комнаты в «Депо». Выберите время на табло, оставьте заявку — администратор подтвердит её в течение получаса.",
  address: "г. Москва, ул. Трамвайная, 14", // TODO: заменить на реальный адрес
  phone: "+7 900 000-00-00", // TODO: заменить на реальный телефон
  email: "hello@depo.example", // TODO: заменить на реальную почту
  mapUrl: "https://yandex.ru/maps/", // TODO: ссылка на точку в картах
} as const;

/** Базовый URL сайта. На Vercel подставляется автоматически. */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}
