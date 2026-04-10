import { z } from "zod";

import { AppError } from "../errors.js";
import { formatTimestamp, parseTimeInput } from "../time.js";
import type { CaptionPresetId, OutputMode } from "../types.js";

const captionPresetValues = [
  "bottom-creator",
  "bottom-compact",
  "lower-third-clean",
  "center-punch",
  "top-clean",
] as const satisfies readonly CaptionPresetId[];

const outputModeValues = ["reel", "original"] as const satisfies readonly OutputMode[];

export const smartRecommendationResponseSchema = z
  .object({
    start: z.string().trim().min(1),
    end: z.string().trim().min(1),
    mode: z.enum(outputModeValues),
    captionPreset: z.enum(captionPresetValues),
    reason: z.string().trim().min(1).max(240),
  })
  .strict();

export const clipSuggestionItemSchema = z
  .object({
    start: z.string().trim().min(1),
    end: z.string().trim().min(1),
    label: z.string().trim().min(1).max(80),
    reason: z.string().trim().min(1).max(240),
    confidence: z.number().gte(0).lte(1),
    captionPreset: z.enum(captionPresetValues),
    mode: z.enum(outputModeValues),
  })
  .strict();

export const clipSuggestionsResponseSchema = z
  .object({
    ideas: z.array(clipSuggestionItemSchema).length(3),
  })
  .strict();

export const packageOutputSchema = z
  .object({
    titles: z.array(z.string().trim().min(1).max(120)).length(5),
    thumbnailText: z.array(z.string().trim().min(1).max(60)).length(3),
    socialCaption: z.string().trim().min(1).max(1200),
    hashtags: z.array(z.string().trim().min(1).max(40)).min(5).max(10),
    hooks: z.array(z.string().trim().min(1).max(120)).min(2).max(3).default([]),
  })
  .strict();

export interface SmartRecommendation {
  startSeconds: number;
  endSeconds: number;
  startTimestamp: string;
  endTimestamp: string;
  mode: OutputMode;
  captionPreset: CaptionPresetId;
  reason: string;
}

export interface ClipSuggestion extends SmartRecommendation {
  label: string;
  confidence: number;
}

export interface PackageOutput {
  titles: string[];
  thumbnailText: string[];
  socialCaption: string;
  hashtags: string[];
  hooks: string[];
}

export const smartRecommendationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["start", "end", "mode", "captionPreset", "reason"],
  properties: {
    start: { type: "string" },
    end: { type: "string" },
    mode: { type: "string", enum: outputModeValues },
    captionPreset: { type: "string", enum: captionPresetValues },
    reason: { type: "string" },
  },
} as const;

export const clipSuggestionsJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["ideas"],
  properties: {
    ideas: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["start", "end", "label", "reason", "confidence", "captionPreset", "mode"],
        properties: {
          start: { type: "string" },
          end: { type: "string" },
          label: { type: "string" },
          reason: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          captionPreset: { type: "string", enum: captionPresetValues },
          mode: { type: "string", enum: outputModeValues },
        },
      },
    },
  },
} as const;

export const packageOutputJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["titles", "thumbnailText", "socialCaption", "hashtags", "hooks"],
  properties: {
    titles: {
      type: "array",
      minItems: 5,
      maxItems: 5,
      items: { type: "string" },
    },
    thumbnailText: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: { type: "string" },
    },
    socialCaption: { type: "string" },
    hashtags: {
      type: "array",
      minItems: 5,
      maxItems: 10,
      items: { type: "string" },
    },
    hooks: {
      type: "array",
      minItems: 2,
      maxItems: 3,
      items: { type: "string" },
    },
  },
} as const;

interface RangeContext {
  durationSeconds?: number;
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

export function extractJsonText(rawText: string): string {
  const stripped = stripCodeFence(rawText);
  if (!stripped) {
    throw new AppError("The AI response was empty.", {
      code: "AI_EMPTY_RESPONSE",
    });
  }

  if (stripped.startsWith("{") || stripped.startsWith("[")) {
    return stripped;
  }

  const firstBrace = Math.min(
    ...["{", "["]
      .map((char) => stripped.indexOf(char))
      .filter((index) => index >= 0),
  );
  const lastBrace = Math.max(stripped.lastIndexOf("}"), stripped.lastIndexOf("]"));
  if (Number.isFinite(firstBrace) && firstBrace >= 0 && lastBrace > firstBrace) {
    return stripped.slice(firstBrace, lastBrace + 1);
  }

  return stripped;
}

export function parseStructuredJson<T>(rawText: string, schema: z.ZodType<T>, errorCode: string): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonText(rawText)) as unknown;
  } catch (error) {
    throw new AppError("The AI response was not valid JSON.", {
      code: `${errorCode}_JSON_INVALID`,
      details: error instanceof Error ? error.message : String(error),
      cause: error,
    });
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new AppError("The AI response did not match the expected shape.", {
      code: `${errorCode}_SCHEMA_INVALID`,
      details: result.error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`).join("; "),
    });
  }

  return result.data;
}

function normalizeRange(
  start: string,
  end: string,
  context: RangeContext,
  errorCode: string,
): Pick<SmartRecommendation, "startSeconds" | "endSeconds" | "startTimestamp" | "endTimestamp"> {
  let startSeconds: number;
  let endSeconds: number;

  try {
    startSeconds = parseTimeInput(start);
    endSeconds = parseTimeInput(end);
  } catch (error) {
    throw new AppError("The AI suggested an invalid time range.", {
      code: `${errorCode}_TIME_INVALID`,
      details: error instanceof Error ? error.message : String(error),
      cause: error,
    });
  }

  if (context.durationSeconds !== undefined) {
    if (startSeconds >= context.durationSeconds) {
      throw new AppError("The AI suggested a clip that starts after the video ends.", {
        code: `${errorCode}_START_PAST_END`,
      });
    }
    endSeconds = Math.min(endSeconds, context.durationSeconds);
  }

  if (endSeconds <= startSeconds) {
    throw new AppError("The AI suggested a clip with an invalid end time.", {
      code: `${errorCode}_RANGE_INVALID`,
    });
  }

  return {
    startSeconds,
    endSeconds,
    startTimestamp: formatTimestamp(startSeconds),
    endTimestamp: formatTimestamp(endSeconds),
  };
}

function normalizeHashtag(rawTag: string): string | undefined {
  const compact = rawTag.replace(/^#+/, "").replace(/[^a-zA-Z0-9_]+/g, "");
  if (!compact) {
    return undefined;
  }
  return `#${compact}`;
}

export function normalizeSmartRecommendation(
  raw: z.infer<typeof smartRecommendationResponseSchema>,
  context: RangeContext,
): SmartRecommendation {
  return {
    ...normalizeRange(raw.start, raw.end, context, "AI_SMART"),
    mode: raw.mode,
    captionPreset: raw.captionPreset,
    reason: collapseWhitespace(raw.reason),
  };
}

export function normalizeClipSuggestions(
  raw: z.infer<typeof clipSuggestionsResponseSchema>,
  context: RangeContext,
): ClipSuggestion[] {
  const ideas = raw.ideas.map((idea) => ({
    ...normalizeRange(idea.start, idea.end, context, "AI_SUGGEST"),
    label: collapseWhitespace(idea.label),
    reason: collapseWhitespace(idea.reason),
    confidence: Number(idea.confidence.toFixed(2)),
    captionPreset: idea.captionPreset,
    mode: idea.mode,
  }));

  const uniqueIdeas = ideas.filter((idea, index) => {
    const key = `${idea.startSeconds}:${idea.endSeconds}:${idea.label.toLowerCase()}`;
    return ideas.findIndex((candidate) => `${candidate.startSeconds}:${candidate.endSeconds}:${candidate.label.toLowerCase()}` === key) === index;
  });

  if (uniqueIdeas.length !== 3) {
    throw new AppError("The AI did not return three distinct clip ideas.", {
      code: "AI_SUGGEST_DUPLICATE_IDEAS",
    });
  }

  return uniqueIdeas;
}

export function normalizePackageOutput(raw: z.infer<typeof packageOutputSchema>): PackageOutput {
  const hashtags = Array.from(
    new Map(
      raw.hashtags
        .map((tag) => normalizeHashtag(tag))
        .filter((tag): tag is string => Boolean(tag))
        .map((tag) => [tag.toLowerCase(), tag]),
    ).values(),
  );

  if (hashtags.length < 5) {
    throw new AppError("The AI did not return enough usable hashtags.", {
      code: "AI_PACKAGE_HASHTAGS_INVALID",
    });
  }

  return {
    titles: raw.titles.map(collapseWhitespace),
    thumbnailText: raw.thumbnailText.map(collapseWhitespace),
    socialCaption: raw.socialCaption.trim(),
    hashtags: hashtags.slice(0, 10),
    hooks: raw.hooks.map(collapseWhitespace),
  };
}
