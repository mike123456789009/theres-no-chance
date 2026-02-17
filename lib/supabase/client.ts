import { createBrowserClient } from "@supabase/ssr";

type BrowserPublicConfig = {
  supabaseUrl?: string;
  supabasePublishableKey?: string;
};

declare global {
  interface Window {
    __TNC_PUBLIC_CONFIG__?: BrowserPublicConfig;
  }
}

function clean(value: string | undefined): string {
  if (typeof value !== "string") return "";

  return value
    .replace(/\\r\\n/g, "")
    .replace(/\\n/g, "")
    .replace(/\\r/g, "")
    .trim();
}

function resolveBrowserSupabaseConfig() {
  const fromEnvUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const fromEnvKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  const fromWindow = typeof window !== "undefined" ? window.__TNC_PUBLIC_CONFIG__ : undefined;
  const url = clean(fromEnvUrl) || clean(fromWindow?.supabaseUrl);
  const publishableKey = clean(fromEnvKey) || clean(fromWindow?.supabasePublishableKey);

  if (!url || !publishableKey) {
    throw new Error(
      "Missing Supabase public configuration. Configure NEXT_PUBLIC_SUPABASE_* on Vercel or SUPABASE_* fallback vars."
    );
  }

  return { url, publishableKey };
}

export function createClient() {
  const config = resolveBrowserSupabaseConfig();
  return createBrowserClient(config.url, config.publishableKey);
}
