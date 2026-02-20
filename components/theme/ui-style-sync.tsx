"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { UI_STYLE_COOKIE_KEY, UI_STYLE_COOKIE_MAX_AGE_SECONDS, UI_STYLE_STORAGE_KEY } from "@/lib/theme/constants";
import { parseUiStyle, parseUiStyleCookie } from "@/lib/theme/parse";
import type { UiStyle } from "@/lib/theme/types";
import { createClient } from "@/lib/supabase/client";

type UiStyleContextValue = {
  uiStyle: UiStyle;
  setUiStyle: (style: UiStyle) => void;
};

const UiStyleContext = createContext<UiStyleContextValue | null>(null);

function applyUiStyleToDom(style: UiStyle): void {
  document.documentElement.dataset.uiStyle = style;
  if (document.body) {
    document.body.dataset.uiStyle = style;
  }

  window.dispatchEvent(
    new CustomEvent("tnc:ui-style-changed", {
      detail: { uiStyle: style },
    })
  );
}

function persistUiStyleLocally(style: UiStyle): void {
  window.localStorage.setItem(UI_STYLE_STORAGE_KEY, style);
  document.cookie = `${UI_STYLE_COOKIE_KEY}=${encodeURIComponent(style)}; path=/; max-age=${UI_STYLE_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
}

export function UiStyleSync({
  children,
  initialStyle,
}: Readonly<{
  children: React.ReactNode;
  initialStyle: UiStyle;
}>) {
  const [uiStyle, setUiStyleState] = useState<UiStyle>(initialStyle);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);

  useEffect(() => {
    try {
      const fromCookie = parseUiStyleCookie(document.cookie, UI_STYLE_COOKIE_KEY);
      const fromStorage = parseUiStyle(window.localStorage.getItem(UI_STYLE_STORAGE_KEY));
      const resolved = fromCookie ?? fromStorage;

      if (resolved) {
        setUiStyleState((current) => (current === resolved ? current : resolved));
      }
    } catch {
      // Ignore storage access issues.
    }
  }, []);

  useEffect(() => {
    try {
      applyUiStyleToDom(uiStyle);
      persistUiStyleLocally(uiStyle);
    } catch {
      // Ignore storage access issues.
    }
  }, [uiStyle]);

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

  const value = useMemo<UiStyleContextValue>(
    () => ({
      uiStyle,
      setUiStyle,
    }),
    [uiStyle, setUiStyle]
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
