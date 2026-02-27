import { describe, expect, it } from "vitest";

import { CATEGORY_TO_CARD_TONES, MARKET_CATEGORY_KEYS, pickCategoryCardTone } from "./taxonomy";

describe("market taxonomy card tones", () => {
  it("keeps economy markets off peach-heavy mapping", () => {
    expect(CATEGORY_TO_CARD_TONES.economy).not.toContain("peach");
  });

  it("selects tones deterministically for a category and seed", () => {
    const first = pickCategoryCardTone("finance", "event:fomc-mar-2026");
    const second = pickCategoryCardTone("finance", "event:fomc-mar-2026");

    expect(first).toBe(second);
  });

  it("always returns a tone from the configured category pool", () => {
    const seeds = ["alpha", "beta", "gamma", "delta", "epsilon"];

    for (const category of MARKET_CATEGORY_KEYS) {
      const allowed = CATEGORY_TO_CARD_TONES[category];
      for (const seed of seeds) {
        expect(allowed).toContain(pickCategoryCardTone(category, seed));
      }
    }
  });
});
