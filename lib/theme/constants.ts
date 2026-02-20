import type { UiPalette, UiStyle } from "@/lib/theme/types";

export const UI_STYLE_COOKIE_KEY = "tnc-ui-style";
export const UI_STYLE_STORAGE_KEY = "tnc-ui-style";
export const UI_STYLE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
export const UI_PALETTE_COOKIE_KEY = "tnc-ui-palette";
export const UI_PALETTE_STORAGE_KEY = "tnc-ui-palette";
export const UI_PALETTE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export const UI_STYLE_VALUES: readonly UiStyle[] = ["retro", "modern"] as const;
export const UI_STYLE_DEFAULT: UiStyle = "retro";
export const UI_PALETTE_VALUES: readonly UiPalette[] = ["hearth", "sand", "onyx"] as const;
export const UI_PALETTE_DEFAULT: UiPalette = "hearth";

export const UI_PALETTE_LABELS: Readonly<Record<UiPalette, string>> = {
  hearth: "Hearth",
  sand: "Sand",
  onyx: "Onyx",
};
