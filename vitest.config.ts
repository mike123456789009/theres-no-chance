import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: [
        "app/api/**/*.{ts,tsx}",
        "components/**/*.{ts,tsx}",
        "lib/**/*.{ts,tsx}",
      ],
      exclude: [
        "node_modules/**",
        "**/*.test.*",
        "**/*.spec.*",
        "**/__tests__/**",
        "**/*.d.ts",
        "lib/supabase/**",
      ],
      thresholds: {
        lines: 20,
        functions: 20,
        branches: 15,
        statements: 20,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
