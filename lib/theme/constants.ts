import type { UiStyle } from "@/lib/theme/types";

export const UI_STYLE_COOKIE_KEY = "tnc-ui-style";
export const UI_STYLE_STORAGE_KEY = "tnc-ui-style";
export const UI_STYLE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export const UI_STYLE_VALUES: readonly UiStyle[] = ["retro", "modern"] as const;
export const UI_STYLE_DEFAULT: UiStyle = "retro";
