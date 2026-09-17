import { neon } from "@neondatabase/serverless";

import { resolveUrl } from "./_db";

/**
 * Полная очистка базы.
 *
 * Удобно, пока схема ещё меняется: сносит всё и позволяет накатить миграции
 * заново. Данные не сохраняются — поэтому требует явного `--yes` и печатает,
 * что именно собирается снести.
 *
 *   pnpm db:reset --yes
 *   pnpm db:reset --yes --test   (по TEST_DATABASE_URL)
 */

async function main() {
  const confirmed = process.argv.includes("--yes");
  const url = resolveUrl("DATABASE_URL");
  const sql = neon(url);
  const host = url.split("@")[1]?.split("/")[0] ?? "?";

  const tables = await sql`
    SELECT table_name, (
      SELECT reltuples::bigint FROM pg_class WHERE oid = ('public.' || quote_ident(table_name))::regclass
    ) AS rows
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `;

  console.log(`\n  База: ${host}`);
  console.log(`  Таблиц в public: ${tables.length}`);
  for (const row of tables) {
    console.log(`    ${row.table_name} (~${row.rows} строк)`);
  }

  if (!confirmed) {
    console.log("\n  Ничего не удалено. Чтобы снести всё: pnpm db:reset --yes\n");
    return;
  }

  await sql`DROP SCHEMA public CASCADE`;
  await sql`CREATE SCHEMA public`;
  await sql`DROP SCHEMA IF EXISTS drizzle CASCADE`;

  console.log("\n  Схема очищена. Теперь: pnpm db:migrate && pnpm db:seed\n");
}

main().catch((error) => {
  console.error("Не получилось:", error instanceof Error ? error.message : error);
  process.exit(1);
});
