import type { SubtitleCue, SubtitleDocument } from "../types.js";

const MIN_SUBTITLE_DURATION_MS = 120;

function clampCue(cue: SubtitleCue, offsetMs: number): SubtitleCue | undefined {
  const shiftedStart = Math.max(0, cue.startMs - offsetMs);
  const shiftedEnd = Math.max(0, cue.endMs - offsetMs);

  if (shiftedEnd <= shiftedStart) {
    return undefined;
  }

  return {
    ...cue,
    startMs: shiftedStart,
    endMs: shiftedEnd,
  };
}

function normalizeTimeline(cues: SubtitleCue[]): SubtitleCue[] {
  const sortedCues = [...cues].sort((left, right) => {
    if (left.startMs !== right.startMs) {
      return left.startMs - right.startMs;
    }

    if (left.endMs !== right.endMs) {
      return left.endMs - right.endMs;
    }

    return left.index - right.index;
  });

  const normalized: SubtitleCue[] = [];

  for (const cue of sortedCues) {
    const nextCue: SubtitleCue = {
      ...cue,
      text: cue.text.trim(),
    };

    let mergedIntoPrevious = false;

    while (normalized.length > 0) {
      const previousCue = normalized.at(-1)!;

      if (previousCue.text === nextCue.text && nextCue.startMs <= previousCue.endMs) {
        previousCue.endMs = Math.max(previousCue.endMs, nextCue.endMs);
        mergedIntoPrevious = true;
        break;
      }

      if (nextCue.startMs >= previousCue.endMs) {
        break;
      }

      previousCue.endMs = nextCue.startMs;
      if (previousCue.endMs - previousCue.startMs < MIN_SUBTITLE_DURATION_MS) {
        normalized.pop();
        continue;
      }

      break;
    }

    if (mergedIntoPrevious) {
      continue;
    }

    const previousCue = normalized.at(-1);
    if (previousCue && nextCue.startMs < previousCue.endMs) {
      nextCue.startMs = previousCue.endMs;
    }

    if (nextCue.endMs - nextCue.startMs < MIN_SUBTITLE_DURATION_MS) {
      continue;
    }

    normalized.push(nextCue);
  }

  return normalized.map((cue, index) => ({
    ...cue,
    index: index + 1,
  }));
}

export function shiftSubtitles(document: SubtitleDocument, offsetMs: number): SubtitleDocument {
  const shiftedCues = document.cues
    .map((cue) => clampCue(cue, offsetMs))
    .filter((cue): cue is SubtitleCue => cue !== undefined);

  const cues = normalizeTimeline(shiftedCues);

  return { cues };
}
