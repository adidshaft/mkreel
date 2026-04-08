import fs from "fs-extra";

import type { SubtitleCue, SubtitleDocument } from "../types.js";

function formatTimestamp(milliseconds: number): string {
  const normalized = Math.max(0, Math.floor(milliseconds));
  const hours = Math.floor(normalized / 3_600_000);
  const minutes = Math.floor((normalized % 3_600_000) / 60_000);
  const seconds = Math.floor((normalized % 60_000) / 1000);
  const millis = normalized % 1000;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}

function serializeCue(cue: SubtitleCue): string {
  return `${cue.index}\n${formatTimestamp(cue.startMs)} --> ${formatTimestamp(cue.endMs)}\n${cue.text.trim()}`;
}

export function serializeSrt(document: SubtitleDocument): string {
  return document.cues.map(serializeCue).join("\n\n").trimEnd() + "\n";
}

export async function writeSrt(document: SubtitleDocument, outputPath: string): Promise<void> {
  await fs.writeFile(outputPath, serializeSrt(document), "utf8");
}
