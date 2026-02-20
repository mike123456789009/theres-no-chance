"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import {
  UI_PALETTE_COOKIE_KEY,
  UI_PALETTE_COOKIE_MAX_AGE_SECONDS,
  UI_PALETTE_DEFAULT,
  UI_PALETTE_STORAGE_KEY,
  UI_PALETTE_VALUES,
  UI_STYLE_COOKIE_KEY,
  UI_STYLE_COOKIE_MAX_AGE_SECONDS,
  UI_STYLE_STORAGE_KEY,
} from "@/lib/theme/constants";
import { parseCookieValue, parseUiPalette, parseUiStyle, parseUiStyleCookie } from "@/lib/theme/parse";
import type { UiPalette, UiStyle } from "@/lib/theme/types";
import { createClient } from "@/lib/supabase/client";

type UiStyleContextValue = {
  uiStyle: UiStyle;
  uiPalette: UiPalette;
  setUiStyle: (style: UiStyle) => void;
  setUiPalette: (palette: UiPalette) => void;
  cycleUiPalette: () => void;
};

const UiStyleContext = createContext<UiStyleContextValue | null>(null);

function applyUiThemeToDom(style: UiStyle, palette: UiPalette): void {
  document.documentElement.dataset.uiStyle = style;
  document.documentElement.dataset.uiPalette = palette;
  if (document.body) {
    document.body.dataset.uiStyle = style;
    document.body.dataset.uiPalette = palette;
  }

  window.dispatchEvent(
    new CustomEvent("tnc:ui-style-changed", {
      detail: { uiStyle: style, uiPalette: palette },
    })
  );
  window.dispatchEvent(
    new CustomEvent("tnc:ui-palette-changed", {
      detail: { uiStyle: style, uiPalette: palette },
    })
  );
}

function persistUiStyleLocally(style: UiStyle): void {
  window.localStorage.setItem(UI_STYLE_STORAGE_KEY, style);
  document.cookie = `${UI_STYLE_COOKIE_KEY}=${encodeURIComponent(style)}; path=/; max-age=${UI_STYLE_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
}

function persistUiPaletteLocally(palette: UiPalette): void {
  window.localStorage.setItem(UI_PALETTE_STORAGE_KEY, palette);
  document.cookie = `${UI_PALETTE_COOKIE_KEY}=${encodeURIComponent(palette)}; path=/; max-age=${UI_PALETTE_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
}

export function UiStyleSync({
  children,
  initialStyle,
  initialPalette,
}: Readonly<{
  children: React.ReactNode;
  initialStyle: UiStyle;
  initialPalette: UiPalette;
}>) {
  const [uiStyle, setUiStyleState] = useState<UiStyle>(initialStyle);
  const [uiPalette, setUiPaletteState] = useState<UiPalette>(initialPalette);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);

  useEffect(() => {
    try {
      const fromCookie = parseUiStyleCookie(document.cookie, UI_STYLE_COOKIE_KEY);
      const fromStorage = parseUiStyle(window.localStorage.getItem(UI_STYLE_STORAGE_KEY));
      const resolved = fromCookie ?? fromStorage;
      const fromPaletteCookie = parseUiPalette(parseCookieValue(document.cookie, UI_PALETTE_COOKIE_KEY));
      const fromPaletteStorage = parseUiPalette(window.localStorage.getItem(UI_PALETTE_STORAGE_KEY));
      const resolvedPalette = fromPaletteCookie ?? fromPaletteStorage;

      if (resolved) {
        setUiStyleState((current) => (current === resolved ? current : resolved));
      }
      if (resolvedPalette) {
        setUiPaletteState((current) => (current === resolvedPalette ? current : resolvedPalette));
      }

      const queryParams = new URLSearchParams(window.location.search);
      const fromQuery = parseUiPalette(queryParams.get("palette"));
      if (fromQuery) {
        setUiPaletteState(fromQuery);
      }
    } catch {
      // Ignore storage access issues.
    }
  }, []);

  useEffect(() => {
    try {
      applyUiThemeToDom(uiStyle, uiPalette);
      persistUiStyleLocally(uiStyle);
      persistUiPaletteLocally(uiPalette);
    } catch {
      // Ignore storage access issues.
    }
  }, [uiPalette, uiStyle]);

  const persistUiStyleToProfile = useCallback(async (style: UiStyle) => {
    try {
      const supabase = supabaseRef.current ?? createClient();
      supabaseRef.current = supabase;

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user?.id) {
        return;
      }

      await supabase.from("profiles").upsert(
        {
          id: user.id,
          ui_style: style,
        },
        {
          onConflict: "id",
        }
      );

      await supabase.auth.updateUser({
        data: {
          ui_style: style,
        },
      });
    } catch {
      // Ignore profile persistence failures to keep UI responsive.
    }
  }, []);

  const setUiStyle = useCallback(
    (style: UiStyle) => {
      if (style === uiStyle) return;
      setUiStyleState(style);
      void persistUiStyleToProfile(style);
    },
    [persistUiStyleToProfile, uiStyle]
  );

  const setUiPalette = useCallback((palette: UiPalette) => {
    setUiPaletteState((current) => (current === palette ? current : palette));
  }, []);

  const cycleUiPalette = useCallback(() => {
    setUiPaletteState((current) => {
      const currentIndex = UI_PALETTE_VALUES.indexOf(current);
      const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % UI_PALETTE_VALUES.length;
      return UI_PALETTE_VALUES[nextIndex] ?? UI_PALETTE_DEFAULT;
    });
  }, []);

  const value = useMemo<UiStyleContextValue>(
    () => ({
      uiStyle,
      uiPalette,
      setUiStyle,
      setUiPalette,
      cycleUiPalette,
    }),
    [uiStyle, uiPalette, setUiStyle, setUiPalette, cycleUiPalette]
  );

  return <UiStyleContext.Provider value={value}>{children}</UiStyleContext.Provider>;
}

export function useUiStyle(): UiStyleContextValue {
  const context = useContext(UiStyleContext);
  if (!context) {
    throw new Error("useUiStyle must be used within UiStyleSync.");
  }
  return context;
}
