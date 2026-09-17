import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  ADMIN_COOKIE,
  isValidSessionToken,
  readBasicPassword,
  timingSafeEqual,
} from "@/lib/admin-session";

/**
 * Защита админки. В Next 16 это бывший middleware.
 *
 * Два способа входа на один пароль:
 *  - браузер получает страницу входа и подписанную куку. Basic Auth здесь не
 *    годится: у него нет выхода, диалог не в стиле сайта, а Chromium на
 *    неудачной попытке уходит в ERR_TOO_MANY_RETRIES вместо повторного запроса;
 *  - скрипты шлют заголовок Authorization: Basic — так удобнее подключать бота
 *    после смены домена и дёргать админские роуты из терминала.
 *
 * Заголовок WWW-Authenticate не отправляется намеренно: иначе браузер снова
 * покажет свой диалог, от которого мы и уходим.
 */

const LOGIN_PATH = "/admin/login";

function unauthorized() {
  return NextResponse.json(
    { error: "unauthorized", message: "Нужен пароль администратора" },
    { status: 401 },
  );
}

export async function proxy(request: NextRequest) {
  const password = process.env.ADMIN_PASSWORD;

  if (!password) {
    return new NextResponse("Админка не настроена: задайте ADMIN_PASSWORD", { status: 503 });
  }

  const { pathname } = request.nextUrl;

  // Страницу входа пускаем всегда, иначе некуда было бы вводить пароль.
  if (pathname === LOGIN_PATH) return NextResponse.next();

  // Скрипт пришёл с заголовком — отвечаем ему как скрипту, без редиректов.
  const authorization = request.headers.get("authorization");
  if (authorization) {
    const supplied = readBasicPassword(authorization);
    return supplied && timingSafeEqual(supplied, password) ? NextResponse.next() : unauthorized();
  }

  if (await isValidSessionToken(request.cookies.get(ADMIN_COOKIE)?.value, password)) {
    return NextResponse.next();
  }

  // Запросы за данными не редиректим — им нужен внятный код ответа.
  if (request.headers.get("accept")?.includes("application/json") || request.method !== "GET") {
    return unauthorized();
  }

  const login = request.nextUrl.clone();
  login.pathname = LOGIN_PATH;
  login.search = pathname === "/admin" ? "" : `?next=${encodeURIComponent(pathname)}`;

  return NextResponse.redirect(login);
}

export const config = {
  matcher: "/admin/:path*",
};
