import { UI_PALETTE_DEFAULT, UI_PALETTE_VALUES, UI_STYLE_DEFAULT } from "@/lib/theme/constants";
import type { UiPalette, UiStyle } from "@/lib/theme/types";

export function isUiStyle(value: unknown): value is UiStyle {
  return value === "retro" || value === "modern";
}

export function parseUiStyle(value: unknown): UiStyle | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return isUiStyle(normalized) ? normalized : null;
}

export function isUiPalette(value: unknown): value is UiPalette {
  return typeof value === "string" && UI_PALETTE_VALUES.includes(value as UiPalette);
}

export function parseUiPalette(value: unknown): UiPalette | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return isUiPalette(normalized) ? normalized : null;
}

export function parseCookieValue(cookieHeader: string | null | undefined, key: string): string | null {
  if (!cookieHeader) return null;

  const segments = cookieHeader.split(";");
  for (const segment of segments) {
    const [rawName, ...rest] = segment.split("=");
    if (rawName?.trim() !== key) continue;
    const rawValue = rest.join("=");
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }

  return null;
}

export function parseUiStyleCookie(cookieHeader: string | null | undefined, key: string): UiStyle | null {
  return parseUiStyle(parseCookieValue(cookieHeader, key));
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

export function resolveUiPalette(options: {
  cookieValue?: unknown;
  fallback?: UiPalette;
}): UiPalette {
  const fromCookie = parseUiPalette(options.cookieValue);
  if (fromCookie) return fromCookie;

  return options.fallback ?? UI_PALETTE_DEFAULT;
}
