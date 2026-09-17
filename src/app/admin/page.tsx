import type { Metadata } from "next";
import Link from "next/link";

import { SiteHeader } from "@/components/site/chrome";
import { type BookingSummary, listBookings } from "@/domain/booking";
import { formatPrice } from "@/domain/pricing";
import { formatDateTime, formatDuration, formatTime } from "@/lib/time";
import { formatPhoneMask } from "@/lib/validation/booking";

import { type WebhookState, decide, readWebhookState } from "./actions";
import { signOut } from "./login/actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Заявки",
  robots: { index: false, follow: false },
};

const STATUS_LABEL: Record<BookingSummary["status"], string> = {
  pending: "ждёт решения",
  confirmed: "подтверждена",
  rejected: "отклонена",
  expired: "просрочена",
  cancelled: "отменена",
};

const FILTERS = [
  { value: "", label: "Все" },
  { value: "pending", label: "Ждут решения" },
  { value: "confirmed", label: "Подтверждённые" },
  { value: "rejected", label: "Отклонённые" },
] as const;

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const params = await searchParams;
  const raw = typeof params.status === "string" ? params.status : "";
  const status = (["pending", "confirmed", "rejected"] as const).find((item) => item === raw);

  const [bookings, webhook] = await Promise.all([listBookings({ status }), readWebhookState()]);
  const timezone = "Europe/Moscow";

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-3xl px-4 py-10">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="font-display text-3xl">Заявки</h1>
          <form action={signOut}>
            <button className="decoration-line hover:decoration-ink text-sm underline underline-offset-4">
              Выйти
            </button>
          </form>
        </div>

        <TelegramPanel state={webhook} />

        <nav className="mt-6 flex flex-wrap gap-1.5">
          {FILTERS.map((filter) => {
            const active = filter.value === (status ?? "");
            return (
              <Link
                key={filter.value}
                href={filter.value ? `/admin?status=${filter.value}` : "/admin"}
                className={`rounded-sm border px-3 py-2 text-sm transition-colors ${
                  active ? "border-ink bg-ink text-paper" : "border-line-strong bg-card"
                }`}
              >
                {filter.label}
              </Link>
            );
          })}
        </nav>

        {bookings.length === 0 ? (
          <p className="border-line bg-panel text-ink-soft mt-8 border px-4 py-6">
            Заявок пока нет.
          </p>
        ) : (
          <ul className="mt-6 space-y-3">
            {bookings.map((booking) => (
              <li
                key={booking.id}
                data-res={booking.resourceSlug}
                className="border-line bg-card border p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="font-display text-lg">{booking.resourceTitle}</span>
                  <span
                    className={`text-sm ${
                      booking.status === "pending" ? "text-res-ink font-medium" : "text-ink-soft"
                    }`}
                  >
                    {STATUS_LABEL[booking.status]}
                  </span>
                </div>

                <p className="tnum mt-1">
                  {formatDateTime(booking.start, timezone)} – {formatTime(booking.end, timezone)},{" "}
                  {formatDuration(booking.durationMin)}, {formatPrice(booking.priceMinor)}
                </p>

                <p className="mt-2 text-sm">
                  {booking.customerName},{" "}
                  <a href={`tel:${booking.phone}`} className="tnum underline underline-offset-4">
                    {formatPhoneMask(booking.phone)}
                  </a>
                  {booking.email && `, ${booking.email}`}
                  {booking.guests > 1 && `, гостей: ${booking.guests}`}
                </p>

                {booking.unitTitle !== booking.resourceTitle && (
                  <p className="text-ink-soft mt-1 text-sm">{booking.unitTitle}</p>
                )}

                {booking.comment && (
                  <p className="border-line text-ink-soft mt-2 border-l-2 pl-3 text-sm">
                    {booking.comment}
                  </p>
                )}

                <p className="text-ink-soft mt-2 text-xs">
                  Код {booking.publicCode}, создана {formatDateTime(booking.createdAt, timezone)}
                  {booking.status === "pending" &&
                    `, держит слот до ${formatTime(booking.expiresAt, timezone)}`}
                </p>

                {booking.status === "pending" && (
                  <div className="mt-3 flex gap-2">
                    <form action={decide}>
                      <input type="hidden" name="id" value={booking.id} />
                      <input type="hidden" name="decision" value="confirmed" />
                      <button className="border-ink bg-ink text-paper border px-4 py-2 text-sm">
                        Подтвердить
                      </button>
                    </form>
                    <form action={decide}>
                      <input type="hidden" name="id" value={booking.id} />
                      <input type="hidden" name="decision" value="rejected" />
                      <button className="border-line-strong border px-4 py-2 text-sm">
                        Отклонить
                      </button>
                    </form>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}

/**
 * Состояние бота.
 *
 * Подписка на вебхук делается отсюда, а не локальным скриптом: сервер Vercel
 * достучится до Telegram даже там, где локальная машина не может.
 */
function TelegramPanel({ state }: { state: WebhookState }) {
  if (!state.configured) {
    return (
      <p className="border-line bg-panel text-ink-soft mt-6 border px-4 py-3 text-sm">
        Бот не настроен: заполните переменные TELEGRAM_* — заявки пока видны только здесь.
      </p>
    );
  }

  if ("error" in state) {
    return (
      <div className="border-line bg-panel mt-6 border px-4 py-3 text-sm">
        <p className="text-destructive">Telegram не отвечает: {state.error}</p>
        <ConnectButton label="Попробовать ещё раз" />
      </div>
    );
  }

  const connected = state.url === state.expected;

  return (
    <div className="border-line bg-panel mt-6 space-y-2 border px-4 py-3 text-sm">
      <p className={connected ? "text-ink" : "text-destructive"}>
        {connected ? "Бот подключён к этому сайту." : "Бот не подключён к этому сайту."}
      </p>

      {!connected && (
        <p className="text-ink-soft">
          Сейчас вебхук ведёт на {state.url || "никуда"}, а нужно на {state.expected}
        </p>
      )}

      {state.pending > 0 && (
        <p className="text-ink-soft">Необработанных обновлений: {state.pending}</p>
      )}

      {state.lastError && <p className="text-destructive">Последняя ошибка: {state.lastError}</p>}

      <ConnectButton label={connected ? "Переподключить" : "Подключить бота"} />
    </div>
  );
}

function ConnectButton({ label }: { label: string }) {
  return (
    <form method="post" action="/admin/connect">
      <button className="border-line-strong mt-1 border px-4 py-2 text-sm">{label}</button>
    </form>
  );
}
