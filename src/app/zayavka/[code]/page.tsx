import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StatusWatcher } from "@/components/booking/status-watcher";
import { SiteFooter, SiteHeader } from "@/components/site/chrome";
import { getBookingByCode } from "@/domain/booking";
import { getResourceBySlug } from "@/domain/resources";
import { formatPrice } from "@/domain/pricing";
import type { BookingStatus } from "@/db/schema";
import { isPublicCode } from "@/lib/public-code";
import { site } from "@/lib/site";
import { formatDateTime, formatDuration, formatTime } from "@/lib/time";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Заявка",
  robots: { index: false, follow: false },
};

const VIEW: Record<BookingStatus, { title: string; body: string }> = {
  pending: {
    title: "Заявка принята",
    body: "Администратор подтвердит её и перезвонит вам. Время уже удержано за вами — пока заявка в работе, его никто не займёт.",
  },
  confirmed: {
    title: "Бронь подтверждена",
    body: "Ждём вас в указанное время. Оплата на месте. Если планы изменятся — позвоните, пожалуйста, заранее.",
  },
  rejected: {
    title: "Заявку отклонили",
    body: "На это время забронировать не получилось. Позвоните нам — подберём другое, или выберите время сами.",
  },
  expired: {
    title: "Время заявки истекло",
    body: "Мы не успели подтвердить бронь, и слот вернулся в расписание. Выберите время заново — это быстро.",
  },
  cancelled: {
    title: "Бронь отменена",
    body: "Эта бронь больше не действует. Если отмена вышла по ошибке, позвоните нам.",
  },
};

export default async function BookingStatusPage({ params }: PageProps<"/zayavka/[code]">) {
  const { code } = await params;

  if (!isPublicCode(code)) notFound();

  const booking = await getBookingByCode(code);
  if (!booking) notFound();

  const view = VIEW[booking.status];
  const resource = await getResourceBySlug(booking.resourceSlug);
  const timezone = resource?.timezone ?? "Europe/Moscow";

  return (
    <div data-res={booking.resourceSlug}>
      <SiteHeader />
      <StatusWatcher code={booking.publicCode} status={booking.status} />

      <main className="mx-auto max-w-xl px-4 py-12">
        <h1 className="font-display text-[clamp(2rem,8vw,3rem)] leading-tight">{view.title}</h1>
        <p className="text-ink-soft mt-4 leading-relaxed">{view.body}</p>

        <dl className="border-line bg-panel mt-8 border">
          <Row label="Что">{booking.resourceTitle}</Row>
          <Row label="Когда">
            {formatDateTime(booking.start, timezone)} – {formatTime(booking.end, timezone)}
          </Row>
          <Row label="Длительность">{formatDuration(booking.durationMin)}</Row>
          {booking.guests > 1 && <Row label="Гостей">{booking.guests}</Row>}
          <Row label="Стоимость">{formatPrice(booking.priceMinor)}</Row>
          <Row label="Код заявки">{booking.publicCode}</Row>
        </dl>

        {booking.status === "pending" && (
          <p className="text-ink-soft mt-4 text-sm">
            Статус на этой странице обновляется сам — можно держать её открытой.
          </p>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
          <a
            href={`tel:${site.phone.replace(/[^\d+]/g, "")}`}
            className="tnum text-ink decoration-line hover:decoration-ink underline underline-offset-4"
          >
            {site.phone}
          </a>
          <Link
            href={`/${booking.resourceSlug}`}
            className="decoration-line hover:decoration-ink underline underline-offset-4"
          >
            Выбрать другое время
          </Link>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-line flex justify-between gap-4 border-b px-4 py-3 text-sm last:border-b-0">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="tnum text-right font-medium">{children}</dd>
    </div>
  );
}
