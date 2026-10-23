import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Integration tests share one Postgres test database.
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
