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
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/markets/read-markets/*"],
              message: "Import from '@/lib/markets/read-markets' to stay on the public market-read boundary.",
            },
            {
              group: ["@/components/markets/page-sections/*"],
              message: "Import from '@/components/markets/page-sections' to stay on the page-sections barrel.",
            },
            {
              group: ["@/components/markets/create-market/steps/*"],
              message: "Import from '@/components/markets/create-market/steps' to stay on the create-market steps barrel.",
            },
          ],
        },
      ],
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];

export default config;
