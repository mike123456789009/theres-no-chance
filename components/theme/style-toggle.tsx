"use client";

import { useEffect, useRef, useState } from "react";

import { useUiStyle } from "@/components/theme/ui-style-sync";
import { UI_PALETTE_LABELS, UI_PALETTE_VALUES } from "@/lib/theme/constants";
import type { UiPalette, UiStyle } from "@/lib/theme/types";

function joinClassNames(...values: Array<string | undefined>): string {
  return values.filter((value): value is string => Boolean(value && value.trim())).join(" ");
}

export function StyleToggle({ className }: Readonly<{ className?: string }>) {
  const { uiStyle, uiPalette, setUiStyle, setUiPalette, cycleUiPalette } = useUiStyle();
  const paletteMenuRef = useRef<HTMLDivElement>(null);
  const [isPaletteMenuOpen, setPaletteMenuOpen] = useState(false);

  function onStyleSelect(style: UiStyle): void {
    setUiStyle(style);
  }

  function onPaletteCycle(): void {
    cycleUiPalette();
    setPaletteMenuOpen(false);
  }

  function onPaletteSelect(palette: UiPalette): void {
    setUiPalette(palette);
    setPaletteMenuOpen(false);
  }

  useEffect(() => {
    if (!isPaletteMenuOpen) return;

    function onDocumentPointerDown(event: PointerEvent): void {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!paletteMenuRef.current?.contains(target)) {
        setPaletteMenuOpen(false);
      }
    }

    function onDocumentKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setPaletteMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", onDocumentPointerDown);
    document.addEventListener("keydown", onDocumentKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onDocumentPointerDown);
      document.removeEventListener("keydown", onDocumentKeyDown);
    };
  }, [isPaletteMenuOpen]);

  return (
    <div
      className={joinClassNames(
        "style-toggle-stack",
        uiStyle === "modern" ? "has-palette-controls" : undefined,
        className
      )}
    >
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
          <div
            ref={paletteMenuRef}
            className={joinClassNames("palette-combo-pill", isPaletteMenuOpen ? "is-open" : undefined)}
          >
            <button
              type="button"
              className="palette-vibe-inline-button"
              onClick={onPaletteCycle}
              aria-label={`Cycle modern vibe. Current vibe is ${UI_PALETTE_LABELS[uiPalette]}`}
            >
              Vibe:
            </button>
            <button
              type="button"
              className="palette-select-trigger"
              onClick={() => setPaletteMenuOpen((current) => !current)}
              aria-label={`Select modern vibe. Current vibe is ${UI_PALETTE_LABELS[uiPalette]}`}
              aria-haspopup="listbox"
              aria-expanded={isPaletteMenuOpen}
            >
              {UI_PALETTE_LABELS[uiPalette]}
            </button>
            <div className="palette-dropdown-menu" role="listbox" aria-hidden={!isPaletteMenuOpen}>
              {UI_PALETTE_VALUES.map((palette) => (
                <button
                  key={palette}
                  type="button"
                  role="option"
                  className={joinClassNames(
                    "palette-option-button",
                    palette === uiPalette ? "is-selected" : undefined
                  )}
                  aria-selected={palette === uiPalette}
                  onClick={() => onPaletteSelect(palette)}
                >
                  {UI_PALETTE_LABELS[palette]}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
