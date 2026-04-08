import { escapeFilterValue } from "../deps/ffmpeg.js";

export function buildSubtitleFilter(
  subtitlePath: string,
  inputLabel: string,
  outputLabel: string,
): string {
  const normalizedPath = subtitlePath.replaceAll("\\", "/");
  return `[${inputLabel}]ass=filename=${escapeFilterValue(normalizedPath)}[${outputLabel}]`;
}
