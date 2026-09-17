import type { Metadata } from "next";

import { SiteHeader } from "@/components/site/chrome";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Вход",
  robots: { index: false, follow: false },
};

/**
 * Вход в админку.
 *
 * Обычная страница вместо диалога Basic Auth: она в стиле сайта, из неё можно
 * выйти, и браузер не уходит в бесконечные повторы на неверном пароле.
 */
export default async function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  const { next } = await searchParams;
  const target = typeof next === "string" && next.startsWith("/admin") ? next : "/admin";

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-sm px-4 py-20">
        <h1 className="font-display text-3xl">Админка</h1>
        <p className="text-ink-soft mt-3 text-sm">Здесь видно заявки и решения по ним.</p>

        <LoginForm next={target} />
      </main>
    </>
  );
}
