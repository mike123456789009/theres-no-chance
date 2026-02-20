import type { Metadata } from "next";
import "./globals.css";
import "./trade-interface.css";

import { UiStyleSync } from "@/components/theme/ui-style-sync";
import {
  UI_PALETTE_COOKIE_KEY,
  UI_PALETTE_STORAGE_KEY,
  UI_STYLE_COOKIE_KEY,
  UI_STYLE_STORAGE_KEY,
} from "@/lib/theme/constants";
import { resolveInitialUiPalette, resolveInitialUiStyle } from "@/lib/theme/server";
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
  const initialUiPalette = await resolveInitialUiPalette();

  const clientConfigScript = `window.__TNC_PUBLIC_CONFIG__=${JSON.stringify({
    supabaseUrl: supabasePublicConfig?.url ?? "",
    supabasePublishableKey: supabasePublicConfig?.publishableKey ?? "",
  })};`;

  const uiStyleHydrationScript = `(() => {
    try {
      const storageKey = "${UI_STYLE_STORAGE_KEY}";
      const cookieKey = "${UI_STYLE_COOKIE_KEY}";
      const paletteStorageKey = "${UI_PALETTE_STORAGE_KEY}";
      const paletteCookieKey = "${UI_PALETTE_COOKIE_KEY}";
      const isValidStyle = (value) => value === "retro" || value === "modern";
      const isValidPalette = (value) => value === "hearth" || value === "sand" || value === "onyx";
      const cookiePairs = document.cookie ? document.cookie.split(";") : [];
      let cookieValue = null;
      let paletteCookieValue = null;

      for (const pair of cookiePairs) {
        const [rawName, ...rest] = pair.split("=");
        if (!rawName) continue;
        const name = rawName.trim();

        if (name === cookieKey) {
          cookieValue = decodeURIComponent(rest.join("="));
        }

        if (name === paletteCookieKey) {
          paletteCookieValue = decodeURIComponent(rest.join("="));
        }
      }

      const storageValue = window.localStorage.getItem(storageKey);
      const paletteStorageValue = window.localStorage.getItem(paletteStorageKey);
      const queryParams = new URLSearchParams(window.location.search);
      const paletteQueryValue = queryParams.get("palette");
      const resolved = isValidStyle(cookieValue) ? cookieValue : isValidStyle(storageValue) ? storageValue : null;
      const resolvedPalette = isValidPalette(paletteQueryValue)
        ? paletteQueryValue
        : isValidPalette(paletteCookieValue)
          ? paletteCookieValue
          : isValidPalette(paletteStorageValue)
            ? paletteStorageValue
            : null;

      if (resolved) {
        document.documentElement.dataset.uiStyle = resolved;
      }
      if (resolvedPalette) {
        document.documentElement.dataset.uiPalette = resolvedPalette;
      }
    } catch {
      // Ignore storage read issues in private browsing modes.
    }
  })();`;

  return (
    <html lang="en" data-ui-style={initialUiStyle} data-ui-palette={initialUiPalette}>
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
      <body data-render-mode="boot" data-ui-style={initialUiStyle} data-ui-palette={initialUiPalette}>
        <UiStyleSync initialStyle={initialUiStyle} initialPalette={initialUiPalette}>
          {children}
        </UiStyleSync>
      </body>
    </html>
  );
}
