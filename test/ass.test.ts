import { describe, expect, it } from "vitest";

import { serializeAss } from "../src/subtitles/ass.js";
import type { SubtitleDocument, SubtitlePlacement } from "../src/types.js";

const document: SubtitleDocument = {
  cues: [
    {
      index: 1,
      startMs: 0,
      endMs: 1500,
      text: "First line\nSecond line",
    },
  ],
};

const placement: SubtitlePlacement = {
  preset: "bottom",
  label: "Bottom safe",
  textPreset: "balanced",
  alignment: 2,
  marginV: 220,
  marginL: 96,
  marginR: 96,
  fontSize: 70,
  outline: 5,
  shadow: 1,
  bold: true,
};

describe("ASS subtitle rendering", () => {
  it("serializes a caption file with canvas-aware styling", () => {
    const ass = serializeAss(document, placement, {
      width: 1080,
      height: 1920,
    });

    expect(ass).toContain("PlayResX: 1080");
    expect(ass).toContain("PlayResY: 1920");
    expect(ass).toContain("WrapStyle: 0");
    expect(ass).toContain("Style: Default,Arial,70");
    expect(ass).toContain(",5,1,2,96,96,220,1");
    expect(ass).toContain("Dialogue: 0,0:00:00.00,0:00:01.50,Default,,0,0,0,,First line\\NSecond line");
  });

  it("auto-wraps long dialogue into multiple lines", () => {
    const ass = serializeAss(
      {
        cues: [
          {
            index: 1,
            startMs: 0,
            endMs: 2000,
            text: "This is a very long caption line that should wrap before it reaches the edge of the frame",
          },
        ],
      },
      placement,
      {
        width: 1080,
        height: 1920,
      },
    );

    expect(ass).toMatch(/Dialogue: 0,[^\n]*\\N/);
  });
});
