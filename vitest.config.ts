import { defineConfig } from "vitest/config";

// Kept separate from vite.config.ts so unit tests do not boot the Cloudflare runtime.
export default defineConfig({
  test: { include: ["tests/unit/**/*.test.ts"] },
});
