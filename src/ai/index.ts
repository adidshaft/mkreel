import {
  clipSuggestionsJsonSchema,
  clipSuggestionsResponseSchema,
  normalizeClipSuggestions,
  normalizePackageOutput,
  normalizeSmartRecommendation,
  packageOutputJsonSchema,
  packageOutputSchema,
  parseStructuredJson,
  smartRecommendationJsonSchema,
  smartRecommendationResponseSchema,
} from "./contracts.js";
import { buildPackagePrompt, buildSmartPrompt, buildSuggestPrompt, type PackagePromptInput } from "./prompts.js";
import { runStructuredPromptWithProvider } from "./provider.js";
import type { ClipSuggestion, PackageOutput, SmartRecommendation } from "./contracts.js";
import type { AiProviderName, AiProviderPreference } from "../types.js";

interface TranscriptRequestInput {
  ai: AiProviderPreference;
  cwd: string;
  sourceTitle: string;
  uploader?: string;
  durationSeconds?: number;
  transcriptText: string;
  creatorGoal?: string;
  timeoutMs?: number;
}

interface StructuredAiResult<T> {
  provider: AiProviderName;
  data: T;
}

export async function getSmartRecommendation(
  input: TranscriptRequestInput,
): Promise<StructuredAiResult<SmartRecommendation>> {
  const result = await runStructuredPromptWithProvider(
    input.ai,
    {
      cwd: input.cwd,
      prompt: buildSmartPrompt(input),
      schema: smartRecommendationJsonSchema,
      timeoutMs: input.timeoutMs,
    },
  );

  const parsed = parseStructuredJson(result.rawText, smartRecommendationResponseSchema, "AI_SMART");
  return {
    provider: result.provider,
    data: normalizeSmartRecommendation(parsed, {
      durationSeconds: input.durationSeconds,
    }),
  };
}

export async function getClipSuggestions(
  input: TranscriptRequestInput,
): Promise<StructuredAiResult<ClipSuggestion[]>> {
  const result = await runStructuredPromptWithProvider(
    input.ai,
    {
      cwd: input.cwd,
      prompt: buildSuggestPrompt(input),
      schema: clipSuggestionsJsonSchema,
      timeoutMs: input.timeoutMs,
    },
  );

  const parsed = parseStructuredJson(result.rawText, clipSuggestionsResponseSchema, "AI_SUGGEST");
  return {
    provider: result.provider,
    data: normalizeClipSuggestions(parsed, {
      durationSeconds: input.durationSeconds,
    }),
  };
}

export async function getPackageOutput(
  input: PackagePromptInput & {
    ai: AiProviderPreference;
    cwd: string;
    timeoutMs?: number;
  },
): Promise<StructuredAiResult<PackageOutput>> {
  const result = await runStructuredPromptWithProvider(
    input.ai,
    {
      cwd: input.cwd,
      prompt: buildPackagePrompt(input),
      schema: packageOutputJsonSchema,
      timeoutMs: input.timeoutMs,
    },
  );

  const parsed = parseStructuredJson(result.rawText, packageOutputSchema, "AI_PACKAGE");
  return {
    provider: result.provider,
    data: normalizePackageOutput(parsed),
  };
}
