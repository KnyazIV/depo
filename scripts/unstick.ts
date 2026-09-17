import { sql } from "drizzle-orm";

import { connect } from "./_db";

/**
 * Снятие висящих транзакций.
 *
 * Если миграция оборвалась на полпути (например, Neon перезапустил compute при
 * установке расширения), её транзакция остаётся в состоянии «idle in
 * transaction» и держит блокировки на созданные объекты. Следующие миграции
 * после этого просто висят без всякой ошибки.
 *
 * Скрипт показывает такие сессии и снимает их.
 */

type Session = {
  pid: number;
  state: string | null;
  query: string | null;
  idle_seconds: number | null;
};

async function main() {
  const { db } = connect("DATABASE_URL_UNPOOLED", "DATABASE_URL");

  try {
    const { rows } = await db.execute<Session>(sql`
      select pid,
             state,
             left(coalesce(query, ''), 70) as query,
             extract(epoch from now() - state_change)::int as idle_seconds
      from pg_stat_activity
      where datname = current_database()
        and pid <> pg_backend_pid()
        and state = 'idle in transaction'
    `);

    if (rows.length === 0) {
      console.log("Висящих транзакций нет.");
      return;
    }

    console.log(`Нашлось ${rows.length}:`);
    for (const row of rows) {
      console.log(`  pid ${row.pid}, простаивает ${row.idle_seconds} с — ${row.query}`);
    }

    const { rows: killed } = await db.execute<{ pid: number }>(sql`
      select pid, pg_terminate_backend(pid)
      from pg_stat_activity
      where datname = current_database()
        and pid <> pg_backend_pid()
        and state = 'idle in transaction'
    `);

    console.log(`Снято сессий: ${killed.length}. Повторите pnpm db:migrate.`);
  } finally {
    // HTTP-драйверу нечего закрывать.
  }
}

main().catch((error) => {
  console.error("Не получилось:", error instanceof Error ? error.message : error);
  process.exit(1);
});
