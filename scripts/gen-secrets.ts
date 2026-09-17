import { randomBytes } from "node:crypto";

/**
 * Генерация секретов для .env.local.
 *
 * На Windows нет openssl, поэтому проще сгенерировать их здесь:
 * `pnpm gen:secrets`
 */

const secrets = ["TELEGRAM_WEBHOOK_SECRET", "CRON_SECRET", "IP_HASH_SALT", "ADMIN_PASSWORD"];

console.log("\n  Скопируйте в .env.local и в переменные окружения Vercel:\n");

for (const name of secrets) {
  const length = name === "ADMIN_PASSWORD" ? 12 : 32;
  console.log(
    `${name}="${randomBytes(length)
      .toString("hex")
      .slice(0, length * 2)}"`,
  );
}

console.log("");
