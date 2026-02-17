const DEFAULT_APP_BASE_URL = "https://theres-no-chance.com";

function clean(value: string | undefined): string {
  if (typeof value !== "string") return "";
  return value.replace(/\/+$/, "").trim();
}

export function resolveAppBaseUrl(): string {
  const configuredBaseUrl = clean(process.env.NEXT_PUBLIC_APP_BASE_URL);
  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  return DEFAULT_APP_BASE_URL;
}
