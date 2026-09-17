import { readFileSync, readdirSync } from "node:fs";

import { neon } from "@neondatabase/serverless";

import { resolveUrl } from "./_db";

/**
 * Применение миграций.
 *
 * Свой раннер вместо мигратора Drizzle по одной причине: HTTP-драйвер Neon не
 * умеет интерактивные транзакции, поэтому штатный мигратор шлёт операторы по
 * одному и каждый коммитит отдельно. Упавшая на середине миграция оставляет
 * половину объектов, и повторный запуск уже не проходит.
 *
 * Здесь каждый файл уходит одним батчем через `sql.transaction()`: либо
 * применяется целиком, либо не применяется вовсе. Отметка о применении входит
 * в тот же батч, так что рассинхрона между базой и журналом не бывает.
 */

const FOLDER = "./src/db/migrations";
const REQUIRED_EXTENSIONS = ["btree_gist"];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function statementsOf(file: string): string[] {
  return readFileSync(`${FOLDER}/${file}`, "utf8")
    .split("--> statement-breakpoint")
    .map((part) => part.trim())
    .filter((part) => part.replace(/--[^\n]*/g, "").trim().length > 0);
}

async function main() {
  const sql = neon(resolveUrl("DATABASE_URL_UNPOOLED", "DATABASE_URL"));

  // Расширения ставим до основной пачки и с повтором: на свежем проекте Neon
  // первая установка расширения может перезапустить compute и оборвать связь.
  for (const extension of REQUIRED_EXTENSIONS) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await sql.query(`CREATE EXTENSION IF NOT EXISTS ${extension}`);
        break;
      } catch (error) {
        if (attempt === 3) throw error;
        console.log(`  Compute перезапускается, повтор ${attempt + 1} из 3…`);
        await sleep(3_000);
      }
    }
  }

  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  const done = new Set((await sql`SELECT name FROM _migrations`).map((row) => row.name as string));

  const files = readdirSync(FOLDER)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  let applied = 0;

  for (const file of files) {
    if (done.has(file)) continue;

    const statements = statementsOf(file);

    await sql.transaction([
      ...statements.map((text) => sql.query(text)),
      sql.query("INSERT INTO _migrations (name) VALUES ($1)", [file]),
    ]);

    console.log(`  ${file}: ${statements.length} операторов`);
    applied += 1;
  }

  console.log(applied > 0 ? `Применено миграций: ${applied}.` : "Все миграции уже применены.");
}

main().catch((error) => {
  console.error("\nМиграции не применились:", error instanceof Error ? error.message : error);
  console.error("\nБаза не изменилась — незавершённый файл откатился целиком.\n");
  process.exit(1);
});
