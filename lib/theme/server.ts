import { cookies } from "next/headers";

import { UI_STYLE_COOKIE_KEY, UI_STYLE_DEFAULT } from "@/lib/theme/constants";
import { parseUiStyle, resolveUiStyle } from "@/lib/theme/parse";
import type { UiStyle } from "@/lib/theme/types";
import { createClient, isSupabaseServerEnvConfigured } from "@/lib/supabase/server";

type ProfileUiStyleRow = {
  ui_style: UiStyle | null;
} | null;

export async function resolveInitialUiStyle(): Promise<UiStyle> {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(UI_STYLE_COOKIE_KEY)?.value;
  const parsedCookieValue = parseUiStyle(cookieValue);
  if (parsedCookieValue) return parsedCookieValue;

  if (!isSupabaseServerEnvConfigured()) {
    return UI_STYLE_DEFAULT;
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user?.id) {
      return UI_STYLE_DEFAULT;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("ui_style")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      return UI_STYLE_DEFAULT;
    }

    const profileRow = (profile ?? null) as ProfileUiStyleRow;

    return resolveUiStyle({
      profileValue: profileRow?.ui_style,
      fallback: UI_STYLE_DEFAULT,
    });
  } catch {
    return UI_STYLE_DEFAULT;
  }
}
