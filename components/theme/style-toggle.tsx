"use client";

import { useUiStyle } from "@/components/theme/ui-style-sync";
import { UI_PALETTE_LABELS, UI_PALETTE_VALUES } from "@/lib/theme/constants";
import type { UiPalette, UiStyle } from "@/lib/theme/types";

function joinClassNames(...values: Array<string | undefined>): string {
  return values.filter((value): value is string => Boolean(value && value.trim())).join(" ");
}

export function StyleToggle({ className }: Readonly<{ className?: string }>) {
  const { uiStyle, uiPalette, setUiStyle, setUiPalette, cycleUiPalette } = useUiStyle();

  function onStyleSelect(style: UiStyle): void {
    setUiStyle(style);
  }

  function onPaletteSelect(palette: UiPalette): void {
    setUiPalette(palette);
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
        <div className="palette-controls">
          <label htmlFor="palette-select" className="sr-only">
            Modern colorway
          </label>
          <select
            id="palette-select"
            className="palette-select"
            value={uiPalette}
            onChange={(event) => onPaletteSelect(event.target.value as UiPalette)}
          >
            {UI_PALETTE_VALUES.map((palette) => (
              <option key={palette} value={palette}>
                {UI_PALETTE_LABELS[palette]}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="palette-cycle-button"
            onClick={cycleUiPalette}
            aria-label={`Switch modern palette. Current palette is ${UI_PALETTE_LABELS[uiPalette]}`}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
