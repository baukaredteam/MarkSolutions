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
    ],
    setupFiles: ["apps/web/test-setup.ts"],
    testTimeout: 20000,
  },
});
