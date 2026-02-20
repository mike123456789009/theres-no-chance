"use client";

import { useUiStyle } from "@/components/theme/ui-style-sync";
import { UI_PALETTE_LABELS } from "@/lib/theme/constants";
import type { UiStyle } from "@/lib/theme/types";

function joinClassNames(...values: Array<string | undefined>): string {
  return values.filter((value): value is string => Boolean(value && value.trim())).join(" ");
}

export function StyleToggle({ className }: Readonly<{ className?: string }>) {
  const { uiStyle, uiPalette, setUiStyle, cycleUiPalette } = useUiStyle();

  function onStyleSelect(style: UiStyle): void {
    setUiStyle(style);
  }

  return (
    <div className={joinClassNames("style-toggle-stack", className)}>
      <div className="style-toggle" role="group" aria-label="Visual style">
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

      {uiStyle === "modern" ? (
        <button
          type="button"
          className="palette-cycle-button"
          onClick={cycleUiPalette}
          aria-label={`Switch modern palette. Current palette is ${UI_PALETTE_LABELS[uiPalette]}`}
        >
          Colorway: {UI_PALETTE_LABELS[uiPalette]}
        </button>
      ) : null}
    </div>
  );
}
