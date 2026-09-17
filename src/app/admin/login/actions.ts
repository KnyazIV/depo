"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  ADMIN_COOKIE,
  SESSION_DAYS,
  createSessionToken,
  timingSafeEqual,
} from "@/lib/admin-session";
import { adminEnv, isProduction } from "@/lib/env";

/**
 * Вход в админку.
 *
 * Пользователь один, поэтому логина нет — только пароль. Кука подписана самим
 * паролем, так что смена пароля разом закрывает все открытые сессии.
 */
export async function signIn(_state: { error?: string } | undefined, formData: FormData) {
  const supplied = String(formData.get("password") ?? "");
  const target = String(formData.get("next") ?? "/admin");

  if (!timingSafeEqual(supplied, adminEnv().ADMIN_PASSWORD)) {
    // Небольшая задержка: перебирать пароль становится заметно дороже.
    await new Promise((resolve) => setTimeout(resolve, 400));
    return { error: "Неверный пароль" };
  }

  const store = await cookies();
  store.set(ADMIN_COOKIE, await createSessionToken(adminEnv().ADMIN_PASSWORD), {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    path: "/admin",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });

  redirect(target.startsWith("/admin") ? target : "/admin");
}

export async function signOut() {
  const store = await cookies();
  store.delete({ name: ADMIN_COOKIE, path: "/admin" });
  redirect("/admin/login");
}
