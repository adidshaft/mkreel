import { describe, expect, it } from "vitest";

import {
  clipSuggestionsResponseSchema,
  normalizeClipSuggestions,
  normalizePackageOutput,
  normalizeSmartRecommendation,
  packageOutputSchema,
  parseStructuredJson,
  smartRecommendationResponseSchema,
} from "../src/ai/contracts.js";

describe("AI contracts", () => {
  it("parses fenced JSON and validates the smart schema", () => {
    const parsed = parseStructuredJson(
      '```json\n{"start":"00:00:12","end":"00:00:48","mode":"reel","captionPreset":"bottom-creator","reason":"Strong standalone answer."}\n```',
      smartRecommendationResponseSchema,
      "AI_SMART",
    );

    expect(parsed).toMatchObject({
      start: "00:00:12",
      end: "00:00:48",
      mode: "reel",
      captionPreset: "bottom-creator",
    });
  });

  it("normalizes and clamps smart recommendations safely", () => {
    const normalized = normalizeSmartRecommendation(
      {
        start: "00:00:10",
        end: "00:01:20",
        mode: "original",
        captionPreset: "top-clean",
        reason: "  Crisp   ending beat. ",
      },
      { durationSeconds: 60 },
    );

    expect(normalized).toMatchObject({
      startSeconds: 10,
      endSeconds: 60,
      startTimestamp: "00:00:10",
      endTimestamp: "00:01:00",
      mode: "original",
      captionPreset: "top-clean",
      reason: "Crisp ending beat.",
    });
  });

  it("normalizes suggest output into three creator-ready ideas", () => {
    const parsed = parseStructuredJson(
      JSON.stringify({
        ideas: [
          {
            start: "00:00:05",
            end: "00:00:30",
            label: "Quick origin story",
            reason: "Fast setup and a clean payoff.",
            confidence: 0.846,
            captionPreset: "bottom-creator",
            mode: "reel",
          },
          {
            start: "00:01:00",
            end: "00:01:42",
            label: "Hard lesson",
            reason: "Strong emotional turn with a clear takeaway.",
            confidence: 0.78,
            captionPreset: "lower-third-clean",
            mode: "reel",
          },
          {
            start: "00:02:10",
            end: "00:02:48",
            label: "Practical framework",
            reason: "Useful, self-contained advice for creators.",
            confidence: 0.91,
            captionPreset: "top-clean",
            mode: "original",
          },
        ],
      }),
      clipSuggestionsResponseSchema,
      "AI_SUGGEST",
    );

    const normalized = normalizeClipSuggestions(parsed, { durationSeconds: 300 });
    expect(normalized).toHaveLength(3);
    expect(normalized[0]).toMatchObject({
      startTimestamp: "00:00:05",
      endTimestamp: "00:00:30",
      label: "Quick origin story",
      captionPreset: "bottom-creator",
      mode: "reel",
      confidence: 0.85,
    });
  });

  it("normalizes package output and cleans hashtags", () => {
    const parsed = parseStructuredJson(
      JSON.stringify({
        titles: [
          "Why this clip keeps people watching",
          "The 30-second creator lesson",
          "A sharper hook for your next reel",
          "What most creators miss here",
          "One small edit, way bigger impact",
        ],
        thumbnailText: ["Watch This", "Steal This Hook", "Tiny Edit Big Lift"],
        socialCaption: "A fast creator lesson from a longer conversation.",
        hashtags: ["#CreatorTips", "short form", "AudienceGrowth", "#CreatorTips", "#Editing", "Reels"],
        hooks: ["This part changes the whole story.", "Here is the clean takeaway."],
      }),
      packageOutputSchema,
      "AI_PACKAGE",
    );

    const normalized = normalizePackageOutput(parsed);
    expect(normalized.titles).toHaveLength(5);
    expect(normalized.thumbnailText).toHaveLength(3);
    expect(normalized.hashtags).toEqual(["#CreatorTips", "#shortform", "#AudienceGrowth", "#Editing", "#Reels"]);
    expect(normalized.hooks).toHaveLength(2);
  });
});
