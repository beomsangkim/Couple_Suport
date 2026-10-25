import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // server-only은 Next 번들러 밖(테스트)에서는 빈 모듈로 대체한다.
      "server-only": path.resolve(__dirname, "tests/server-only-stub.ts"),
    },
  },
  test: { include: ["tests/**/*.test.ts"] },
});
