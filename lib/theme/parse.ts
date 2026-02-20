import { UI_STYLE_DEFAULT } from "@/lib/theme/constants";
import type { UiStyle } from "@/lib/theme/types";

export function isUiStyle(value: unknown): value is UiStyle {
  return value === "retro" || value === "modern";
}

export function parseUiStyle(value: unknown): UiStyle | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return isUiStyle(normalized) ? normalized : null;
}

export function parseUiStyleCookie(cookieHeader: string | null | undefined, key: string): UiStyle | null {
  if (!cookieHeader) return null;

  const segments = cookieHeader.split(";");
  for (const segment of segments) {
    const [rawName, ...rest] = segment.split("=");
    if (rawName?.trim() !== key) continue;
    const rawValue = rest.join("=");
    try {
      return parseUiStyle(decodeURIComponent(rawValue));
    } catch {
      return parseUiStyle(rawValue);
    }
  }

  return null;
}

export function resolveUiStyle(options: {
  cookieValue?: unknown;
  profileValue?: unknown;
  fallback?: UiStyle;
}): UiStyle {
  const fromCookie = parseUiStyle(options.cookieValue);
  if (fromCookie) return fromCookie;

  const fromProfile = parseUiStyle(options.profileValue);
  if (fromProfile) return fromProfile;

  return options.fallback ?? UI_STYLE_DEFAULT;
}
