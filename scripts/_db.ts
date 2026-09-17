import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "../src/db/schema";

/**
 * Подключение для скриптов.
 *
 * Отдельно от `src/db/client.ts`: тот помечен `server-only` и вне Next
 * не импортируется. Драйвер тот же — HTTP.
 */

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

/**
 * Какую базу берём.
 *
 * С флагом `--test` — тестовую ветку Neon. Так скрипты можно направить на неё
 * явно, не подменяя переменные окружения снаружи: они всё равно перечитывают
 * .env.local сами.
 */
export function resolveUrl(...envNames: string[]): string {
  const candidates = process.argv.includes("--test")
    ? ["TEST_DATABASE_URL"]
    : envNames.length > 0
      ? envNames
      : ["DATABASE_URL"];

  const name = candidates.find((item) => process.env[item]);
  const url = name ? process.env[name] : undefined;

  if (!url) {
    console.error(`\n  Не задана ни одна из переменных: ${candidates.join(", ")}.`);
    console.error("  Скопируйте .env.example в .env.local и впишите строку подключения Neon.\n");
    process.exit(1);
  }

  return url;
}

export function connect(...envNames: string[]) {
  const client = neon(resolveUrl(...envNames));
  return { db: drizzle({ client, schema, casing: "snake_case" }), client };
}

/**
 * Повтор при сетевых сбоях.
 *
 * HTTP-драйвер Neon изредка отдаёт «fetch failed» на медленных каналах.
 * Ошибки самого Postgres не повторяем — их надо чинить, а не переспрашивать.
 */
export async function withRetry<T>(label: string, run: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const transient = /fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|terminated/i.test(
        `${message} ${String((error as { cause?: unknown })?.cause ?? "")}`,
      );

      if (!transient || attempt >= 4) throw error;

      console.log(`  ${label}: связь подвела, повтор ${attempt + 1} из 4…`);
      await new Promise((resolve) => setTimeout(resolve, 1_500 * attempt));
    }
  }
}

export { schema };
