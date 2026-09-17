import type { Metadata } from "next";
import Link from "next/link";

import { SiteHeader } from "@/components/site/chrome";
import { type BookingSummary, listBookings } from "@/domain/booking";
import { formatPrice } from "@/domain/pricing";
import { formatDateTime, formatDuration, formatTime } from "@/lib/time";
import { formatPhoneMask } from "@/lib/validation/booking";

import { decide } from "./actions";

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

  const bookings = await listBookings({ status });
  const timezone = "Europe/Moscow";

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="font-display text-3xl">Заявки</h1>

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
