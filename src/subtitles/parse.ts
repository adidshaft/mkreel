import { AppError } from "../errors.js";
import type { SubtitleCue, SubtitleDocument } from "../types.js";

const TIMECODE_PATTERN =
  /^(?<start>\d{2,}:\d{2}:\d{2},\d{3})\s*-->\s*(?<end>\d{2,}:\d{2}:\d{2},\d{3})$/;

function parseTimestamp(timestamp: string): number {
  const match = /^(?<hours>\d{2,}):(?<minutes>\d{2}):(?<seconds>\d{2}),(?<milliseconds>\d{3})$/.exec(
    timestamp.trim(),
  );

  if (!match?.groups) {
    throw new AppError(`Invalid subtitle timestamp: ${timestamp}`, {
      code: "SRT_TIMESTAMP_INVALID",
    });
  }

  const hours = Number.parseInt(match.groups.hours!, 10);
  const minutes = Number.parseInt(match.groups.minutes!, 10);
  const seconds = Number.parseInt(match.groups.seconds!, 10);
  const milliseconds = Number.parseInt(match.groups.milliseconds!, 10);

  return (((hours * 60 + minutes) * 60 + seconds) * 1000) + milliseconds;
}

export function parseSrt(content: string): SubtitleDocument {
  const normalized = content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return { cues: [] };
  }

  const blocks = normalized.split(/\n{2,}/);
  const cues: SubtitleCue[] = [];

  for (const block of blocks) {
    const lines = block.split("\n");
    if (lines.length < 2) {
      continue;
    }

    const indexLine = lines[0]?.trim() ?? "";
    const timingLine = /^\d+$/.test(indexLine) ? lines[1]?.trim() ?? "" : indexLine;
    const textLines = /^\d+$/.test(indexLine) ? lines.slice(2) : lines.slice(1);

    const match = TIMECODE_PATTERN.exec(timingLine);
    if (!match?.groups) {
      throw new AppError(`Invalid subtitle timing line: ${timingLine}`, {
        code: "SRT_TIMING_LINE_INVALID",
      });
    }

    const cue: SubtitleCue = {
      index: cues.length + 1,
      startMs: parseTimestamp(match.groups.start!),
      endMs: parseTimestamp(match.groups.end!),
      text: textLines.join("\n").trim(),
    };

    if (cue.text) {
      cues.push(cue);
    }
  }

  return { cues };
}
