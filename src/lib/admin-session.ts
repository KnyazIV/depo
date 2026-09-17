/**
 * Сессия администратора.
 *
 * Пользователь один, поэтому таблицы пользователей нет: подписанная кука
 * вместо хранилища сессий. Секрет подписи — сам ADMIN_PASSWORD, так что смена
 * пароля автоматически выбрасывает все открытые сессии.
 *
 * Модуль обязан работать и в Node, и в Edge (его зовёт `proxy.ts`), поэтому
 * только Web Crypto: ни node:crypto, ни Buffer здесь нельзя.
 */

export const ADMIN_COOKIE = "depo_admin";
export const SESSION_DAYS = 7;

const encoder = new TextEncoder();

function toBase64Url(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  return toBase64Url(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
}

/** Сравнение без ранней остановки — чтобы по времени ответа ничего не утекало. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return diff === 0;
}

/** Токен вида `срок.подпись`. */
export async function createSessionToken(secret: string): Promise<string> {
  const expiresAt = String(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  return `${expiresAt}.${await sign(expiresAt, secret)}`;
}

export async function isValidSessionToken(
  token: string | undefined,
  secret: string,
): Promise<boolean> {
  if (!token) return false;

  const separator = token.lastIndexOf(".");
  if (separator <= 0) return false;

  const expiresAt = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  if (!/^\d+$/.test(expiresAt) || Number(expiresAt) < Date.now()) return false;

  return timingSafeEqual(signature, await sign(expiresAt, secret));
}

/** Разбор заголовка Basic — им ходят скрипты, браузеру достаётся кука. */
export function readBasicPassword(header: string | null): string | null {
  const [scheme, encoded] = (header ?? "").split(" ");
  if (scheme !== "Basic" || !encoded) return null;

  let decoded: string;
  try {
    decoded = atob(encoded);
  } catch {
    return null;
  }

  const separator = decoded.indexOf(":");
  if (separator < 0) return null;

  return decoded.slice(0, separator) === "admin" ? decoded.slice(separator + 1) : null;
}
