import type { Metadata } from "next";
import "./globals.css";
import "./trade-interface.css";

import { resolveSupabasePublicConfigFromEnv } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Theres No Chance",
  description: "A local-first prediction market.",
  alternates: {
    canonical: "https://theres-no-chance.com/",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabasePublicConfig = resolveSupabasePublicConfigFromEnv();
  const clientConfigScript = `window.__TNC_PUBLIC_CONFIG__=${JSON.stringify({
    supabaseUrl: supabasePublicConfig?.url ?? "",
    supabasePublishableKey: supabasePublicConfig?.publishableKey ?? "",
  })};`;

  return (
    <html lang="en">
      <head>
        <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg" />
        <link rel="shortcut icon" href="/assets/favicon.svg" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bungee&family=Space+Mono:wght@400;700&display=swap"
          rel="stylesheet"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: clientConfigScript,
          }}
        />
      </head>
      <body data-render-mode="boot">{children}</body>
    </html>
  );
}
