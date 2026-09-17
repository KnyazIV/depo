import Link from "next/link";

import { SiteFooter, SiteHeader } from "@/components/site/chrome";

export default function NotFound() {
  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-xl px-4 py-20">
        <h1 className="font-display text-[clamp(2rem,8vw,3rem)] leading-tight">
          Такой страницы нет
        </h1>
        <p className="text-ink-soft mt-4 leading-relaxed">
          Возможно, ссылка устарела или в адресе опечатка. Расписание на сегодня — на главной.
        </p>
        <Link
          href="/"
          className="border-ink hover:bg-ink hover:text-paper mt-8 inline-block border px-5 py-3 font-medium transition-colors"
        >
          Посмотреть расписание
        </Link>
      </main>

      <SiteFooter />
    </>
  );
}
