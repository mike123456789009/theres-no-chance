"use client";

import { useUiStyle } from "@/components/theme/ui-style-sync";
import type { UiStyle } from "@/lib/theme/types";

function joinClassNames(...values: Array<string | undefined>): string {
  return values.filter((value): value is string => Boolean(value && value.trim())).join(" ");
}

export function StyleToggle({ className }: Readonly<{ className?: string }>) {
  const { uiStyle, setUiStyle } = useUiStyle();

  function onStyleSelect(style: UiStyle): void {
    setUiStyle(style);
  }

  return (
    <div className={joinClassNames("style-toggle", className)} role="group" aria-label="Visual style">
      <button
        type="button"
        className={joinClassNames("style-toggle-button", uiStyle === "retro" ? "is-active" : undefined)}
        onClick={() => onStyleSelect("retro")}
        aria-pressed={uiStyle === "retro"}
      >
        Retro
      </button>
      <button
        type="button"
        className={joinClassNames("style-toggle-button", uiStyle === "modern" ? "is-active" : undefined)}
        onClick={() => onStyleSelect("modern")}
        aria-pressed={uiStyle === "modern"}
      >
        Modern
      </button>
    </div>
  );
}
