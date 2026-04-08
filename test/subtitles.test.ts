import { describe, expect, it } from "vitest";

import { parseSrt } from "../src/subtitles/parse.js";
import { shiftSubtitles } from "../src/subtitles/shift.js";
import { serializeSrt } from "../src/subtitles/write.js";

const inputSrt = `1
00:00:01,000 --> 00:00:03,000
First line

2
00:00:04,500 --> 00:00:06,000
Second line
`;

describe("subtitle retiming", () => {
  it("parses subtitle cues", () => {
    const parsed = parseSrt(inputSrt);
    expect(parsed.cues).toHaveLength(2);
    expect(parsed.cues[0]?.text).toBe("First line");
  });

  it("shifts timestamps, clamps negatives, and renumbers cues", () => {
    const shifted = shiftSubtitles(parseSrt(inputSrt), 2000);
    expect(shifted.cues).toHaveLength(2);
    expect(shifted.cues[0]).toMatchObject({
      index: 1,
      startMs: 0,
      endMs: 1000,
    });
    expect(shifted.cues[1]).toMatchObject({
      index: 2,
      startMs: 2500,
      endMs: 4000,
    });
  });

  it("drops cues that become invalid after shifting", () => {
    const shifted = shiftSubtitles(parseSrt(inputSrt), 5500);
    expect(shifted.cues).toHaveLength(1);
    expect(shifted.cues[0]?.index).toBe(1);
    expect(shifted.cues[0]?.text).toBe("Second line");
  });

  it("removes timeline overlap so only one cue remains visible at a time", () => {
    const overlapping = parseSrt(`1
00:00:00,000 --> 00:00:02,000
hello

2
00:00:01,500 --> 00:00:03,000
hello world
`);

    const shifted = shiftSubtitles(overlapping, 0);
    expect(shifted.cues).toHaveLength(2);
    expect(shifted.cues[0]).toMatchObject({
      startMs: 0,
      endMs: 1500,
      text: "hello",
    });
    expect(shifted.cues[1]).toMatchObject({
      startMs: 1500,
      endMs: 3000,
      text: "hello world",
    });
  });

  it("serializes back into valid SRT", () => {
    const serialized = serializeSrt(shiftSubtitles(parseSrt(inputSrt), 2000));
    expect(serialized).toContain("1\n00:00:00,000 --> 00:00:01,000");
    expect(serialized).toContain("2\n00:00:02,500 --> 00:00:04,000");
  });
});
