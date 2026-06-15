import { describe, expect, it } from "vitest";

import { AppError } from "../src/errors.js";
import { normalizeCliOptions } from "../src/index.js";
import type { RequestedCliOptions } from "../src/types.js";

function customSubtitleOptions(overrides: Partial<RequestedCliOptions>): RequestedCliOptions {
  return {
    url: "https://youtu.be/abc123",
    start: "00:00:05",
    end: "00:00:12",
    mode: "reel",
    subs: "burn",
    subtitlePosition: "custom",
    cwd: process.cwd(),
    nonInteractive: true,
    ...overrides,
  };
}

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
    expect(normalized.smart).toBe(false);
    expect(normalized.ai).toBe("auto");
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

  it("supports smart mode flags without changing the direct defaults", () => {
    const normalized = normalizeCliOptions({
      url: "https://youtu.be/abc123",
      smart: true,
      ai: "claude",
      start: "00:00:05",
      end: "00:00:12",
      mode: "original",
      subs: "skip",
      cwd: process.cwd(),
      nonInteractive: true,
    });

    expect(normalized).toMatchObject({
      smart: true,
      ai: "claude",
      subtitles: "skip",
      subtitlePlacement: undefined,
    });
  });

  it("rejects custom subtitle alignment outside the ASS 1-9 range", () => {
    expect(() => normalizeCliOptions(customSubtitleOptions({ subtitleAlignment: 10 }))).toThrow(AppError);
    expect(() => normalizeCliOptions(customSubtitleOptions({ subtitleAlignment: 10 }))).toThrow(
      "Subtitle alignment must be between 1 and 9.",
    );
  });

  it("rejects unsupported non-interactive subtitle preset values with an app error", () => {
    expect(() =>
      normalizeCliOptions(customSubtitleOptions({ subtitlePosition: "middle" as RequestedCliOptions["subtitlePosition"] })),
    ).toThrow(AppError);
    expect(() =>
      normalizeCliOptions(customSubtitleOptions({ subtitlePosition: "middle" as RequestedCliOptions["subtitlePosition"] })),
    ).toThrow("Invalid CLI option subtitlePosition: Invalid option");
  });

  it("rejects custom subtitle font sizes outside the interactive bounds", () => {
    expect(() => normalizeCliOptions(customSubtitleOptions({ subtitleFontSize: 0 }))).toThrow(AppError);
    expect(() => normalizeCliOptions(customSubtitleOptions({ subtitleFontSize: 0 }))).toThrow(
      "Subtitle font size must be between 16 and 160.",
    );
    expect(() => normalizeCliOptions(customSubtitleOptions({ subtitleFontSize: 161 }))).toThrow(
      "Subtitle font size must be between 16 and 160.",
    );
  });

  it("rejects custom subtitle outline and shadow values above prompt limits", () => {
    expect(() => normalizeCliOptions(customSubtitleOptions({ subtitleOutline: 25 }))).toThrow(AppError);
    expect(() => normalizeCliOptions(customSubtitleOptions({ subtitleOutline: 25 }))).toThrow(
      "Subtitle outline must be between 0 and 24.",
    );
    expect(() => normalizeCliOptions(customSubtitleOptions({ subtitleShadow: 13 }))).toThrow(
      "Subtitle shadow must be between 0 and 12.",
    );
  });
});
