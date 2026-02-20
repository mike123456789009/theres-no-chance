import type { Metadata } from "next";
import "./globals.css";
import "./trade-interface.css";

import { UiStyleSync } from "@/components/theme/ui-style-sync";
import { UI_STYLE_COOKIE_KEY, UI_STYLE_STORAGE_KEY } from "@/lib/theme/constants";
import { resolveInitialUiStyle } from "@/lib/theme/server";
import { resolveSupabasePublicConfigFromEnv } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Theres No Chance",
  description: "A local-first prediction market.",
  alternates: {
    canonical: "https://theres-no-chance.com/",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabasePublicConfig = resolveSupabasePublicConfigFromEnv();
  const initialUiStyle = await resolveInitialUiStyle();

  const clientConfigScript = `window.__TNC_PUBLIC_CONFIG__=${JSON.stringify({
    supabaseUrl: supabasePublicConfig?.url ?? "",
    supabasePublishableKey: supabasePublicConfig?.publishableKey ?? "",
  })};`;

  const uiStyleHydrationScript = `(() => {
    try {
      const storageKey = "${UI_STYLE_STORAGE_KEY}";
      const cookieKey = "${UI_STYLE_COOKIE_KEY}";
      const isValid = (value) => value === "retro" || value === "modern";
      const cookiePairs = document.cookie ? document.cookie.split(";") : [];
      let cookieValue = null;

      for (const pair of cookiePairs) {
        const [rawName, ...rest] = pair.split("=");
        if (rawName && rawName.trim() === cookieKey) {
          cookieValue = decodeURIComponent(rest.join("="));
          break;
        }
      }

      const storageValue = window.localStorage.getItem(storageKey);
      const resolved = isValid(cookieValue) ? cookieValue : isValid(storageValue) ? storageValue : null;

      if (resolved) {
        document.documentElement.dataset.uiStyle = resolved;
      }
    } catch {
      // Ignore storage read issues in private browsing modes.
    }
  })();`;

  return (
    <html lang="en" data-ui-style={initialUiStyle}>
      <head>
        <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg" />
        <link rel="shortcut icon" href="/assets/favicon.svg" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bungee&family=Space+Mono:wght@400;700&family=Manrope:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: clientConfigScript,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: uiStyleHydrationScript,
          }}
        />
      </head>
      <body data-render-mode="boot" data-ui-style={initialUiStyle}>
        <UiStyleSync initialStyle={initialUiStyle}>{children}</UiStyleSync>
      </body>
    </html>
  );
}
