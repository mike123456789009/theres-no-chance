import { describe, expect, it } from "vitest";

import {
  parseCookieValue,
  parseUiPalette,
  parseUiStyle,
  parseUiStyleCookie,
  resolveUiPalette,
  resolveUiStyle,
} from "@/lib/theme/parse";

describe("parseUiStyle", () => {
  it("returns valid style values", () => {
    expect(parseUiStyle("retro")).toBe("retro");
    expect(parseUiStyle("modern")).toBe("modern");
  });

  it("normalizes spacing and casing", () => {
    expect(parseUiStyle("  RETRO ")).toBe("retro");
    expect(parseUiStyle(" Modern ")).toBe("modern");
  });

  it("returns null for unsupported values", () => {
    expect(parseUiStyle("")).toBeNull();
    expect(parseUiStyle("legacy")).toBeNull();
    expect(parseUiStyle(undefined)).toBeNull();
    expect(parseUiStyle(null)).toBeNull();
  });
});

describe("parseUiStyleCookie", () => {
  it("extracts a valid cookie value", () => {
    expect(parseUiStyleCookie("foo=1; tnc-ui-style=modern; bar=2", "tnc-ui-style")).toBe("modern");
  });

  it("returns null when cookie value is invalid", () => {
    expect(parseUiStyleCookie("tnc-ui-style=legacy", "tnc-ui-style")).toBeNull();
  });
});

describe("parseUiPalette", () => {
  it("returns valid palette values", () => {
    expect(parseUiPalette("hearth")).toBe("hearth");
    expect(parseUiPalette("sand")).toBe("sand");
    expect(parseUiPalette("onyx")).toBe("onyx");
  });

  it("normalizes spacing and casing", () => {
    expect(parseUiPalette("  SAND ")).toBe("sand");
    expect(parseUiPalette(" Onyx ")).toBe("onyx");
  });

  it("returns null for unsupported values", () => {
    expect(parseUiPalette("retro")).toBeNull();
    expect(parseUiPalette("")).toBeNull();
    expect(parseUiPalette(undefined)).toBeNull();
  });
});

describe("parseCookieValue", () => {
  it("extracts arbitrary cookie values", () => {
    expect(parseCookieValue("foo=1; tnc-ui-palette=sand; bar=2", "tnc-ui-palette")).toBe("sand");
  });

  it("returns null when key is missing", () => {
    expect(parseCookieValue("foo=1; bar=2", "tnc-ui-palette")).toBeNull();
  });
});

describe("resolveUiStyle", () => {
  it("prefers cookie values", () => {
    expect(
      resolveUiStyle({
        cookieValue: "modern",
        profileValue: "retro",
      })
    ).toBe("modern");
  });

  it("falls back to profile value when cookie is missing", () => {
    expect(
      resolveUiStyle({
        profileValue: "modern",
      })
    ).toBe("modern");
  });

  it("falls back to retro when neither source is valid", () => {
    expect(
      resolveUiStyle({
        cookieValue: "legacy",
        profileValue: "legacy",
      })
    ).toBe("retro");
  });
});

describe("resolveUiPalette", () => {
  it("prefers cookie values", () => {
    expect(
      resolveUiPalette({
        cookieValue: "onyx",
      })
    ).toBe("onyx");
  });

  it("falls back to hearth when cookie is invalid", () => {
    expect(
      resolveUiPalette({
        cookieValue: "legacy",
      })
    ).toBe("hearth");
  });
});
