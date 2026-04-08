import { describe, expect, it } from "vitest";

import { normalizeCliOptions } from "../src/index.js";

describe("CLI normalization", () => {
  it("normalizes times and defaults subtitle placement for burn mode", () => {
    const normalized = normalizeCliOptions({
      url: "https://www.youtube.com/watch?v=abc123",
      start: "8:43",
      end: "11:38",
      mode: "reel",
      subs: "burn",
      cwd: process.cwd(),
      nonInteractive: true,
    });

    expect(normalized.startSeconds).toBe(523);
    expect(normalized.endSeconds).toBe(698);
    expect(normalized.subtitlePlacement).toMatchObject({
      preset: "bottom",
      label: "Bottom safe",
      textPreset: "balanced",
      alignment: 2,
      marginV: 220,
      fontSize: 70,
      outline: 4,
    });
  });

  it("supports custom subtitle placement flags", () => {
    const normalized = normalizeCliOptions({
      url: "https://youtu.be/abc123",
      start: "00:00:05",
      end: "00:00:12",
      mode: "original",
      subs: "burn",
      subtitlePosition: "custom",
      subtitleAlignment: 8,
      subtitleMarginV: 120,
      subtitleMarginL: 60,
      subtitleMarginR: 60,
      subtitleFontSize: 20,
      cwd: process.cwd(),
      nonInteractive: true,
    });

    expect(normalized.subtitlePlacement).toMatchObject({
      preset: "custom",
      label: "Custom",
      textPreset: "balanced",
      alignment: 8,
      marginV: 120,
      marginL: 60,
      marginR: 60,
      fontSize: 20,
    });
  });

  it("applies size and style presets from flags", () => {
    const normalized = normalizeCliOptions({
      url: "https://youtu.be/abc123",
      start: "00:00:05",
      end: "00:00:12",
      mode: "reel",
      subs: "burn",
      subtitlePosition: "lower-third",
      subtitleSize: "xl",
      subtitleStyle: "clean",
      cwd: process.cwd(),
      nonInteractive: true,
    });

    expect(normalized.subtitlePlacement).toMatchObject({
      preset: "lower-third",
      label: "Lower third",
      textPreset: "balanced",
      fontSize: 94,
      outline: 4,
      shadow: 0,
      bold: false,
    });
  });
});
