import { describe, expect, it } from "vitest";

import { buildOutputFilename } from "../src/pipeline/output.js";
import type { VideoMetadata } from "../src/types.js";

const metadata: VideoMetadata = {
  id: "abc123",
  title: "My Great Video Title",
  subtitleAvailability: {
    manualEnglish: true,
    automaticEnglish: false,
    preferredLanguage: "en",
    preferredSource: "manual",
  },
};

describe("output naming", () => {
  it("builds deterministic reel names with subtitle suffixes", () => {
    expect(
      buildOutputFilename(metadata, {
        range: {
          startSeconds: 523,
          endSeconds: 698,
          startTimestamp: "00:08:43",
          endTimestamp: "00:11:38",
        },
        mode: "reel",
        subtitles: "burn",
      }),
    ).toBe("my-great-video-title-08m43s-11m38s-reel-subbed.mp4");
  });

  it("builds original output names when subtitles are skipped", () => {
    expect(
      buildOutputFilename(metadata, {
        range: {
          startSeconds: 10,
          endSeconds: 20,
          startTimestamp: "00:00:10",
          endTimestamp: "00:00:20",
        },
        mode: "original",
        subtitles: "skip",
      }),
    ).toBe("my-great-video-title-00m10s-00m20s-original.mp4");
  });
});
