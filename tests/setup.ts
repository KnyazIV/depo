import { neonConfig } from "@neondatabase/serverless";
import { config } from "dotenv";

/**
 * Подготовка окружения тестов.
 *
 * Интеграционные тесты пишут в базу, поэтому работают только с отдельной
 * TEST_DATABASE_URL — ткнуть их в боевую базу случайно нельзя.
 */

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
} else {
  // Доменные тесты базу не трогают, а интеграционные сами себя пропустят.
  delete process.env.DATABASE_URL;
}

process.env.IP_HASH_SALT ??= "test-salt-test-salt-test-salt";

/**
 * Ограничитель одновременных соединений.
 *
 * Тест на конкурентность поднимает два десятка HTTPS-запросов разом, и с
 * домашнего канала часть из них обрывается по ECONNRESET, не доходя до
 * Postgres. Это шум окружения, а не поведение приложения: на Vercel запросы
 * идут по внутренней сети до Neon.
 *
 * Очередь ставит транспорт в рамки, но саму гонку не убирает — все заявки
 * по-прежнему борются за один слот внутри базы, а разрешает спор
 * EXCLUDE-constraint. В продовый код это не попадает, только в тесты.
 */
const MAX_PARALLEL_REQUESTS = 6;

let inFlight = 0;
const waiting: (() => void)[] = [];

const realFetch = globalThis.fetch;

neonConfig.fetchFunction = async (input: unknown, init: unknown) => {
  if (inFlight >= MAX_PARALLEL_REQUESTS) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  inFlight += 1;

  try {
    return await realFetch(input as RequestInfo, init as RequestInit);
  } finally {
    inFlight -= 1;
    waiting.shift()?.();
  }
};
