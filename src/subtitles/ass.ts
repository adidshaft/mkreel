import fs from "fs-extra";

import {
  DEFAULT_SUBTITLE_COLORS,
  REEL_HEIGHT,
  REEL_WIDTH,
} from "../config.js";
import type {
  SubtitleCue,
  SubtitleDocument,
  SubtitlePlacement,
  SubtitleTextPreset,
  VideoCanvas,
} from "../types.js";

const MIN_AUTO_FIT_FONT_SIZE = 40;
const AUTO_FIT_FONT_STEP = 4;

function formatAssTimestamp(milliseconds: number): string {
  const normalized = Math.max(0, Math.floor(milliseconds));
  const hours = Math.floor(normalized / 3_600_000);
  const minutes = Math.floor((normalized % 3_600_000) / 60_000);
  const seconds = Math.floor((normalized % 60_000) / 1000);
  const centiseconds = Math.floor((normalized % 1000) / 10);

  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}

function scaleForCanvas(value: number, scale: number, minimum = 0): number {
  return Math.max(minimum, Math.round(value * scale));
}

function scaleSubtitlePlacement(
  placement: SubtitlePlacement,
  canvas: VideoCanvas,
): SubtitlePlacement {
  const horizontalScale = canvas.width / REEL_WIDTH;
  const verticalScale = canvas.height / REEL_HEIGHT;

  return {
    ...placement,
    marginL: scaleForCanvas(placement.marginL, horizontalScale),
    marginR: scaleForCanvas(placement.marginR, horizontalScale),
    marginV: scaleForCanvas(placement.marginV, verticalScale),
    fontSize: scaleForCanvas(placement.fontSize, verticalScale, 18),
    outline: scaleForCanvas(placement.outline, verticalScale, 1),
    shadow: scaleForCanvas(placement.shadow, verticalScale),
  };
}

function sanitizeDialogueText(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/\\/g, "/")
    .replace(/\{/g, "(")
    .replace(/\}/g, ")")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\\N");
}

function estimateMaxCharactersPerLine(
  availableWidth: number,
  fontSize: number,
  preset: SubtitleTextPreset,
): number {
  const widthFactor =
    preset === "compact"
      ? 0.5
      : preset === "punch"
        ? 0.62
        : 0.56;

  return Math.max(12, Math.floor(availableWidth / Math.max(1, fontSize * widthFactor)));
}

function maxLinesForPreset(preset: SubtitleTextPreset): number {
  switch (preset) {
    case "compact":
      return 4;
    case "punch":
      return 2;
    case "balanced":
      return 3;
  }
}

function wrapWordsIntoLines(words: string[], maxCharactersPerLine: number): string[] {
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (candidate.length <= maxCharactersPerLine || !currentLine) {
      currentLine = candidate;
      continue;
    }

    lines.push(currentLine);
    currentLine = word;
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function wrapParagraphs(
  text: string,
  maxCharactersPerLine: number,
): string[] {
  const paragraphs = text
    .replace(/\r/g, "")
    .split("\n")
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const wrappedLines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      continue;
    }

    wrappedLines.push(...wrapWordsIntoLines(words, maxCharactersPerLine));
  }

  return wrappedLines;
}

function autoWrapCaptionText(
  text: string,
  placement: SubtitlePlacement,
  canvas: VideoCanvas,
): { dialogueText: string; fontSizeOverride?: number } {
  if (!text.trim()) {
    return {
      dialogueText: "",
    };
  }

  const availableWidth = Math.max(240, canvas.width - placement.marginL - placement.marginR);
  const maxLines = maxLinesForPreset(placement.textPreset);
  let candidateFontSize = placement.fontSize;
  let lines = wrapParagraphs(
    text,
    estimateMaxCharactersPerLine(availableWidth, candidateFontSize, placement.textPreset),
  );

  while (lines.length > maxLines && candidateFontSize > MIN_AUTO_FIT_FONT_SIZE) {
    candidateFontSize = Math.max(MIN_AUTO_FIT_FONT_SIZE, candidateFontSize - AUTO_FIT_FONT_STEP);
    lines = wrapParagraphs(
      text,
      estimateMaxCharactersPerLine(availableWidth, candidateFontSize, placement.textPreset),
    );
    if (candidateFontSize === MIN_AUTO_FIT_FONT_SIZE) {
      break;
    }
  }

  return {
    dialogueText: sanitizeDialogueText(lines.join("\n")),
    fontSizeOverride: candidateFontSize < placement.fontSize ? candidateFontSize : undefined,
  };
}

function serializeDialogue(
  cue: SubtitleCue,
  placement: SubtitlePlacement,
  canvas: VideoCanvas,
): string {
  const wrapped = autoWrapCaptionText(cue.text, placement, canvas);
  const text = wrapped.fontSizeOverride
    ? `{\\fs${wrapped.fontSizeOverride}}${wrapped.dialogueText}`
    : wrapped.dialogueText;

  return [
    "Dialogue: 0",
    formatAssTimestamp(cue.startMs),
    formatAssTimestamp(cue.endMs),
    "Default",
    "",
    "0",
    "0",
    "0",
    "",
    text,
  ].join(",");
}

export function serializeAss(
  document: SubtitleDocument,
  placement: SubtitlePlacement,
  canvas: VideoCanvas,
): string {
  const scaledPlacement = scaleSubtitlePlacement(placement, canvas);
  const boldValue = scaledPlacement.bold ? -1 : 0;

  const header = [
    "[Script Info]",
    "; Generated by mkreel",
    "ScriptType: v4.00+",
    `PlayResX: ${canvas.width}`,
    `PlayResY: ${canvas.height}`,
    "ScaledBorderAndShadow: yes",
    "WrapStyle: 0",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    [
      "Style: Default",
      "Arial",
      scaledPlacement.fontSize,
      DEFAULT_SUBTITLE_COLORS.primaryColour,
      "&H000000FF",
      DEFAULT_SUBTITLE_COLORS.outlineColour,
      DEFAULT_SUBTITLE_COLORS.backColour,
      boldValue,
      0,
      0,
      0,
      100,
      100,
      0,
      0,
      DEFAULT_SUBTITLE_COLORS.borderStyle,
      scaledPlacement.outline,
      scaledPlacement.shadow,
      scaledPlacement.alignment,
      scaledPlacement.marginL,
      scaledPlacement.marginR,
      scaledPlacement.marginV,
      1,
    ].join(","),
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  const events = document.cues.map((cue) => serializeDialogue(cue, scaledPlacement, canvas));

  return [...header, ...events, ""].join("\n");
}

export async function writeAss(
  document: SubtitleDocument,
  placement: SubtitlePlacement,
  canvas: VideoCanvas,
  outputPath: string,
): Promise<void> {
  await fs.writeFile(outputPath, serializeAss(document, placement, canvas), "utf8");
}
