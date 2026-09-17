import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // `server-only` падает при импорте вне бандла Next — в тестах он не нужен.
      "server-only": fileURLToPath(new URL("./tests/stubs/empty.ts", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    // Тест на конкурентность открывает два десятка соединений и ждёт сеть.
    testTimeout: 180_000,
    hookTimeout: 60_000,
    // Интеграционные тесты делят одну базу — параллельные файлы мешали бы друг другу.
    fileParallelism: false,
  },
});
