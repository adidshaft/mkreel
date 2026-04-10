import path from "node:path";

import fs from "fs-extra";

import { formatTimestamp } from "../time.js";
import type { SubtitleCue } from "../types.js";

const SIDE_CAR_EXTENSIONS = new Set([".txt", ".md", ".srt", ".json", ".yaml", ".yml"]);

function normalizeCueText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function buildTranscriptWindows(cues: SubtitleCue[], windowMs: number): string[] {
  const lines: string[] = [];

  for (let index = 0; index < cues.length; ) {
    const firstCue = cues[index];
    if (!firstCue) {
      break;
    }

    const windowStart = firstCue.startMs;
    const windowEnd = windowStart + windowMs;
    const collected: string[] = [];
    let finalEnd = firstCue.endMs;

    while (index < cues.length) {
      const cue = cues[index];
      if (!cue || cue.startMs >= windowEnd) {
        break;
      }

      const normalized = normalizeCueText(cue.text);
      if (normalized) {
        const lastValue = collected[collected.length - 1];
        if (lastValue !== normalized) {
          collected.push(normalized);
        }
      }

      finalEnd = Math.max(finalEnd, cue.endMs);
      index += 1;
    }

    if (collected.length > 0) {
      lines.push(
        `${formatTimestamp(Math.floor(windowStart / 1000))} -> ${formatTimestamp(Math.floor(finalEnd / 1000))} | ${collected.join(" ")}`,
      );
    }
  }

  return lines;
}

export function buildTranscriptContext(
  cues: SubtitleCue[],
  options: {
    maxChars?: number;
  } = {},
): string {
  const maxChars = options.maxChars ?? 24_000;

  if (cues.length === 0) {
    return "No subtitle transcript was available.";
  }

  const candidateWindowSizes = [15_000, 30_000, 60_000];
  let lines = buildTranscriptWindows(cues, candidateWindowSizes[0]!);

  for (const windowSize of candidateWindowSizes) {
    const candidateLines = buildTranscriptWindows(cues, windowSize);
    if (candidateLines.join("\n").length <= maxChars) {
      return candidateLines.join("\n");
    }
    lines = candidateLines;
  }

  while (lines.join("\n").length > maxChars && lines.length > 12) {
    lines = lines.filter((_, index) => index % 2 === 0);
  }

  const joined = lines.join("\n");
  return joined.length <= maxChars ? joined : `${joined.slice(0, maxChars - 32).trimEnd()}\n[transcript truncated]`;
}

export function titleFromFileName(filePath: string): string {
  const stem = path.parse(filePath).name;
  return stem
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function loadPackageSidecarContext(filePath: string, maxChars = 12_000): Promise<string | undefined> {
  const directory = path.dirname(filePath);
  const { base, name } = path.parse(filePath);
  const files = await fs.readdir(directory);

  const sidecars = files
    .filter((candidate) => candidate !== base)
    .filter((candidate) => candidate.startsWith(`${name}.`) || candidate.startsWith(`${name}-`))
    .filter((candidate) => SIDE_CAR_EXTENSIONS.has(path.extname(candidate).toLowerCase()))
    .sort((left, right) => left.localeCompare(right))
    .slice(0, 5);

  if (sidecars.length === 0) {
    return undefined;
  }

  const sections: string[] = [];
  let usedChars = 0;

  for (const sidecar of sidecars) {
    const fullPath = path.join(directory, sidecar);
    const raw = await fs.readFile(fullPath, "utf8");
    const collapsed = raw.replace(/\s+/g, " ").trim();
    if (!collapsed) {
      continue;
    }

    const remaining = maxChars - usedChars;
    if (remaining <= 0) {
      break;
    }

    const excerpt = collapsed.slice(0, Math.max(remaining - sidecar.length - 16, 0)).trim();
    if (!excerpt) {
      continue;
    }

    sections.push(`${sidecar}: ${excerpt}`);
    usedChars += excerpt.length + sidecar.length + 2;
  }

  return sections.length > 0 ? sections.join("\n") : undefined;
}
