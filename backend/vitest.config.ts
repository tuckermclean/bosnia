import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
    // PGlite (in-process WASM Postgres) cold-start can take several seconds
    // under CPU-constrained sandboxes/CI; the vitest defaults (5s test / 10s
    // hook) are tuned for lighter setups and can flake here otherwise.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
