import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
      },
    },
  },
  test: {
    include: [
      "apps/**/*.spec.ts",
      "apps/**/*.spec.tsx",
      "packages/**/*.spec.ts",
      "scripts/**/*.spec.ts",
    ],
    setupFiles: ["apps/web/test-setup.ts"],
    testTimeout: 30000,
    // W0-02R: beforeAll boots a disposable PostgreSQL schema + compiles the Nest
    // app; allow generous hook budget so slow specs don't trip the 30s default.
    hookTimeout: 180000,
    // e2e-спеки мутируют process.env.DATABASE_URL в beforeAll; последовательный
    // запуск файлов исключает параллельную гонку (корень проблемы).
    fileParallelism: false,
  },
});
