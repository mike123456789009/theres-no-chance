"use client";

import { useRef } from "react";

import { useUiStyle } from "@/components/theme/ui-style-sync";
import { UI_PALETTE_LABELS, UI_PALETTE_VALUES } from "@/lib/theme/constants";
import type { UiPalette, UiStyle } from "@/lib/theme/types";

function joinClassNames(...values: Array<string | undefined>): string {
  return values.filter((value): value is string => Boolean(value && value.trim())).join(" ");
}

export function StyleToggle({ className }: Readonly<{ className?: string }>) {
  const { uiStyle, uiPalette, setUiStyle, setUiPalette, cycleUiPalette } = useUiStyle();
  const paletteMenuRef = useRef<HTMLDetailsElement>(null);

  function onStyleSelect(style: UiStyle): void {
    setUiStyle(style);
  }

  function onPaletteSelect(palette: UiPalette): void {
    setUiPalette(palette);
    if (paletteMenuRef.current) {
      paletteMenuRef.current.open = false;
    }
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
        <div className="palette-controls" role="group" aria-label="Modern vibe">
          <button
            type="button"
            className="palette-cycle-button palette-vibe-button"
            onClick={cycleUiPalette}
            aria-label={`Cycle modern vibe. Current vibe is ${UI_PALETTE_LABELS[uiPalette]}`}
          >
            Vibe:
          </button>
          <details ref={paletteMenuRef} className="palette-dropdown">
            <summary
              className="palette-select-trigger"
              aria-label={`Select modern vibe. Current vibe is ${UI_PALETTE_LABELS[uiPalette]}`}
            >
              {UI_PALETTE_LABELS[uiPalette]}
            </summary>
            <div className="palette-dropdown-menu" aria-label="Modern vibe options">
              {UI_PALETTE_VALUES.map((palette) => (
                <button
                  key={palette}
                  type="button"
                  className={joinClassNames(
                    "palette-option-button",
                    palette === uiPalette ? "is-selected" : undefined
                  )}
                  onClick={() => onPaletteSelect(palette)}
                >
                  {UI_PALETTE_LABELS[palette]}
                </button>
              ))}
            </div>
          </details>
        </div>
      ) : null}
    </div>
  );
}
