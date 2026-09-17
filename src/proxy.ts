import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Защита админки.
 *
 * В Next 16 это бывший middleware. Пароль один, логин `admin` — для мини-админки
 * на несколько человек полноценная авторизация была бы лишней сложностью,
 * а Basic Auth поверх https закрывает ровно ту задачу, что нужна.
 */

const REALM = 'Basic realm="Depo admin", charset="UTF-8"';

/** Сравнение без ранней остановки: длина пароля не утекает по времени ответа. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return diff === 0;
}

function challenge() {
  return new NextResponse("Требуется вход", {
    status: 401,
    headers: { "WWW-Authenticate": REALM },
  });
}

export function proxy(request: NextRequest) {
  const password = process.env.ADMIN_PASSWORD;

  if (!password) {
    return new NextResponse("Админка не настроена: задайте ADMIN_PASSWORD", { status: 503 });
  }

  const header = request.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");

  if (scheme !== "Basic" || !encoded) return challenge();

  let decoded: string;
  try {
    decoded = atob(encoded);
  } catch {
    return challenge();
  }

  const separator = decoded.indexOf(":");
  const user = decoded.slice(0, separator);
  const secret = decoded.slice(separator + 1);

  if (user !== "admin" || !timingSafeEqual(secret, password)) return challenge();

  return NextResponse.next();
}

export const config = {
  matcher: "/admin/:path*",
};
