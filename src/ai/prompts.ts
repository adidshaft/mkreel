import type { CaptionPresetId, OutputMode } from "../types.js";

const supportedModes: OutputMode[] = ["reel", "original"];
const supportedCaptionPresets: CaptionPresetId[] = [
  "bottom-creator",
  "bottom-compact",
  "lower-third-clean",
  "center-punch",
  "top-clean",
];

interface BasePromptInput {
  sourceTitle: string;
  uploader?: string;
  durationSeconds?: number;
  creatorGoal?: string;
}

interface TranscriptPromptInput extends BasePromptInput {
  transcriptText: string;
}

export interface PackagePromptInput {
  fileName: string;
  sidecarContext?: string;
  extraContext?: string;
}

function renderHeader(title: string, lines: string[]): string {
  return [`## ${title}`, ...lines.filter(Boolean)].join("\n");
}

function renderBaseSections(input: BasePromptInput): string[] {
  return [
    renderHeader("Source", [
      `title: ${input.sourceTitle}`,
      `uploader: ${input.uploader ?? "unknown"}`,
      `durationSeconds: ${input.durationSeconds ?? "unknown"}`,
      `creatorGoal: ${input.creatorGoal ?? "Find creator-ready short-form moments."}`,
    ]),
    renderHeader("Supported Values", [
      `modes: ${supportedModes.join(", ")}`,
      `captionPresets: ${supportedCaptionPresets.join(", ")}`,
    ]),
  ];
}

export function buildSmartPrompt(input: TranscriptPromptInput): string {
  return [
    "You are helping the mkreel CLI suggest one creator-ready clip.",
    "Return JSON only. No markdown. No backticks. No commentary outside the JSON object.",
    "Choose one self-contained moment that works well as a short social clip.",
    "Prefer a clip between 20 and 75 seconds unless the transcript strongly supports a shorter punchier moment.",
    "Use only the supported mode and captionPreset values you were given.",
    ...renderBaseSections(input),
    renderHeader("Task", [
      "Pick one strong clip range.",
      "Choose the best output mode for that moment.",
      "Choose the best caption preset for readability and social impact.",
      "Give one short reason grounded in the transcript.",
    ]),
    renderHeader("Transcript", [input.transcriptText]),
  ].join("\n\n");
}

export function buildSuggestPrompt(input: TranscriptPromptInput): string {
  return [
    "You are helping the mkreel CLI suggest three distinct creator-ready clip ideas.",
    "Return JSON only. No markdown. No backticks. No commentary outside the JSON object.",
    "Find three different moments that are self-contained, compelling, and strong for short-form video.",
    "Prefer clips between 20 and 90 seconds. Vary the emotional or informational angle when possible.",
    "Use only the supported mode and captionPreset values you were given.",
    ...renderBaseSections(input),
    renderHeader("Task", [
      "Return exactly three ideas.",
      "Each idea must include a short label, a practical reason, and a confidence score from 0 to 1.",
      "Use timestamps grounded in the transcript.",
    ]),
    renderHeader("Transcript", [input.transcriptText]),
  ].join("\n\n");
}

export function buildPackagePrompt(input: PackagePromptInput): string {
  return [
    "You are helping the mkreel CLI generate a polished creator publish pack.",
    "Return JSON only. No markdown. No backticks. No commentary outside the JSON object.",
    "Make the ideas platform-friendly, concise, and punchy without sounding spammy.",
    renderHeader("Source", [
      `fileName: ${input.fileName}`,
      `extraContext: ${input.extraContext ?? "none"}`,
    ]),
    renderHeader("Task", [
      "Return five short title ideas.",
      "Return three thumbnail text ideas.",
      "Return one social caption that feels post-ready.",
      "Return five to ten hashtags.",
      "Return two or three short hook lines for openings or post copy.",
    ]),
    renderHeader("Sidecar Context", [input.sidecarContext ?? "No sidecar metadata was found. Use the filename and extra context only."]),
  ].join("\n\n");
}
