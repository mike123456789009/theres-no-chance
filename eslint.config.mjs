import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTypescript,
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "node_modules/**",
      "public/**",
      "coverage/**",
      "dist/**",
      "**/*.min.js",
    ],
  },
  {
    rules: {
      "@next/next/no-html-link-for-pages": "warn",
      "@next/next/no-sync-scripts": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];

export default config;
