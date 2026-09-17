import { config } from "dotenv";

/**
 * Подписка бота на вебхук.
 *
 * Запускать после деплоя: `pnpm telegram:setup https://depo.vercel.app`
 * Без аргумента берётся NEXT_PUBLIC_SITE_URL.
 */

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const base = (process.argv[2] ?? process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");

function fail(message: string): never {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

if (!token) fail("TELEGRAM_BOT_TOKEN не задан — возьмите токен у @BotFather.");
if (!secret) fail("TELEGRAM_WEBHOOK_SECRET не задан — сгенерируйте его: pnpm gen:secrets");
if (!base.startsWith("https://")) {
  fail("Нужен публичный https-адрес: pnpm telegram:setup https://ваш-домен");
}

async function call(method: string, payload: Record<string, unknown> = {}) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = (await response.json()) as { ok: boolean; result?: unknown; description?: string };
  if (!data.ok) fail(`Telegram ${method}: ${data.description ?? response.status}`);

  return data.result;
}

async function main() {
  const me = (await call("getMe")) as { username: string };

  await call("setWebhook", {
    url: `${base}/api/telegram/webhook`,
    secret_token: secret,
    allowed_updates: ["callback_query"],
    drop_pending_updates: true,
  });

  const info = (await call("getWebhookInfo")) as { url: string; pending_update_count: number };

  console.log(`\n  Бот @${me.username} подписан на ${info.url}`);
  console.log("  Теперь напишите боту или добавьте его в группу администраторов,");
  console.log("  а id чата впишите в TELEGRAM_ADMIN_CHAT_ID.\n");
}

main().catch((error) => fail(String(error)));
