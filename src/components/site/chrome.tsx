import Link from "next/link";

import { site } from "@/lib/site";

import { Logo } from "./logo";

/** Шапка внутренних страниц. На главной логотип работает героем и живёт в самой странице. */
export function SiteHeader() {
  return (
    <header className="border-line border-b">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo className="text-ink size-7" />
          <span className="font-display text-xl">ДЕПО</span>
        </Link>
        <a
          href={`tel:${site.phone.replace(/[^\d+]/g, "")}`}
          className="tnum decoration-line hover:decoration-ink text-sm underline underline-offset-4"
        >
          {site.phone}
        </a>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-line mt-20 border-t">
      <div className="text-ink-soft mx-auto max-w-3xl space-y-3 px-4 py-10 text-sm">
        <p className="text-ink">{site.address}</p>
        <p className="flex flex-wrap gap-x-5 gap-y-2">
          <a
            href={site.mapUrl}
            className="decoration-line hover:decoration-ink underline underline-offset-4"
          >
            Посмотреть на карте
          </a>
          <Link
            href="/policy"
            className="decoration-line hover:decoration-ink underline underline-offset-4"
          >
            Обработка персональных данных
          </Link>
        </p>
        <p className="pt-2">{site.legalName}</p>
      </div>
    </footer>
  );
}
