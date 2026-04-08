import { confirm, input, select } from "@inquirer/prompts";

import {
  DEFAULT_BOTTOM_SUBTITLE_PLACEMENT,
  DEFAULT_TOP_SUBTITLE_PLACEMENT,
  applySubtitleSizePreset,
  applySubtitleStylePreset,
  getDefaultCustomSubtitlePlacement,
  getSubtitlePlacementPreset,
} from "./config.js";
import { AppError } from "./errors.js";
import { formatTimestamp, parseTimeInput, validateTimeRange } from "./time.js";
import type {
  ExecutionOptions,
  NormalizedCliOptions,
  OutputMode,
  SubtitleMode,
  SubtitlePlacement,
  SubtitlePositionPreset,
  SubtitleSizePreset,
  SubtitleStylePreset,
} from "./types.js";

interface SubtitlePromptConfig {
  placement?: SubtitlePlacement;
}

type CaptionPresetChoice = {
  id: string;
  label: string;
  placement: SubtitlePositionPreset;
  size: SubtitleSizePreset;
  style: SubtitleStylePreset;
  textPreset: SubtitlePlacement["textPreset"];
};

const CAPTION_PRESET_CHOICES: CaptionPresetChoice[] = [
  {
    id: "bottom-creator",
    label: "Bottom creator (recommended)",
    placement: "bottom",
    size: "balanced",
    style: "creator",
    textPreset: "balanced",
  },
  {
    id: "bottom-compact",
    label: "Bottom compact",
    placement: "bottom",
    size: "compact",
    style: "creator",
    textPreset: "compact",
  },
  {
    id: "lower-third-clean",
    label: "Lower third clean",
    placement: "lower-third",
    size: "balanced",
    style: "clean",
    textPreset: "balanced",
  },
  {
    id: "center-punch",
    label: "Center punch",
    placement: "center",
    size: "xl",
    style: "creator",
    textPreset: "punch",
  },
  {
    id: "top-clean",
    label: "Top safe clean",
    placement: "top",
    size: "balanced",
    style: "clean",
    textPreset: "balanced",
  },
];

async function promptTime(
  message: string,
  initialValue?: number,
  validateRange?: (valueSeconds: number) => true | string,
): Promise<number> {
  const value = await input({
    message: `${message} (m:ss or hh:mm:ss)`,
    default: initialValue !== undefined ? formatTimestamp(initialValue) : undefined,
    validate(raw) {
      try {
        const seconds = parseTimeInput(raw);
        const validation = validateRange?.(seconds);
        return validation ?? true;
      } catch (error) {
        return error instanceof Error ? error.message : "Invalid time.";
      }
    },
  });

  return parseTimeInput(value);
}

function buildPlacementFromPreset(
  preset: SubtitlePositionPreset,
  seed?: SubtitlePlacement,
): SubtitlePlacement {
  if (preset === "bottom") {
    return { ...DEFAULT_BOTTOM_SUBTITLE_PLACEMENT };
  }

  if (preset === "top") {
    return { ...DEFAULT_TOP_SUBTITLE_PLACEMENT };
  }

  if (preset === "lower-third" || preset === "center") {
    return getSubtitlePlacementPreset(preset);
  }

  return {
    ...getDefaultCustomSubtitlePlacement(),
    ...seed,
    preset: "custom",
    label: "Custom",
  };
}

async function promptCustomPlacement(seed?: SubtitlePlacement): Promise<SubtitlePlacement> {
  const base = buildPlacementFromPreset("custom", seed);

  async function promptNumericField(
    message: string,
    defaultValue: number,
    validate: (value: number) => boolean,
  ): Promise<number> {
    const raw = await input({
      message,
      default: String(defaultValue),
      validate(value) {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isInteger(parsed) || !validate(parsed)) {
          return "Enter a valid whole number.";
        }
        return true;
      },
    });

    return Number.parseInt(raw, 10);
  }

  return {
    preset: "custom",
    label: "Custom",
    textPreset: base.textPreset,
    alignment: await promptNumericField("ASS anchor (1-9)", base.alignment, (value) => value >= 1 && value <= 9),
    marginV: await promptNumericField("Distance from edge", base.marginV, (value) => value >= 0),
    marginL: await promptNumericField("Left padding", base.marginL, (value) => value >= 0),
    marginR: await promptNumericField("Right padding", base.marginR, (value) => value >= 0),
    fontSize: await promptNumericField("Font size", base.fontSize, (value) => value >= 16 && value <= 160),
    outline: await promptNumericField("Outline thickness", base.outline, (value) => value >= 0 && value <= 24),
    shadow: await promptNumericField("Shadow strength", base.shadow, (value) => value >= 0 && value <= 12),
    bold: await confirm({
      message: "Bold captions?",
      default: base.bold,
    }),
  };
}

async function resolveSubtitlePlacement(config: SubtitlePromptConfig = {}): Promise<SubtitlePlacement> {
  const preset = await select<string>({
    message: "Caption look (pick a preset)",
    default: CAPTION_PRESET_CHOICES[0]?.id ?? "bottom-creator",
    choices: [
      ...CAPTION_PRESET_CHOICES.map((choice) => ({
        name: choice.label,
        value: choice.id,
      })),
      { name: "Custom / advanced", value: "custom" },
    ],
  });

  if (preset === "custom") {
    return promptCustomPlacement(config.placement);
  }

  const selectedPreset = CAPTION_PRESET_CHOICES.find((choice) => choice.id === preset);

  if (!selectedPreset) {
    return promptCustomPlacement(config.placement);
  }

  let placement = buildPlacementFromPreset(selectedPreset.placement, config.placement);
  placement = applySubtitleSizePreset(placement, selectedPreset.size);
  placement = applySubtitleStylePreset(placement, selectedPreset.style);
  placement = {
    ...placement,
    label: selectedPreset.label,
    textPreset: selectedPreset.textPreset,
  };

  return placement;
}

export async function collectInteractiveOptions(
  normalized: NormalizedCliOptions,
): Promise<ExecutionOptions> {
  const startSeconds =
    normalized.startSeconds ??
    (await promptTime("Clip start time", undefined));

  const endSeconds =
    normalized.endSeconds ??
    (await promptTime("Clip end time", undefined, (valueSeconds) => {
      try {
        validateTimeRange(startSeconds, valueSeconds);
        return true;
      } catch (error) {
        return error instanceof Error ? error.message : "Invalid range.";
      }
    }));

  validateTimeRange(startSeconds, endSeconds);

  const mode =
    normalized.mode ??
    (await select<OutputMode>({
      message: "Output mode",
      default: "reel",
      choices: [
        { name: "Reel (9:16, best for social clips)", value: "reel" },
        { name: "Original (keep source framing)", value: "original" },
      ],
    }));

  const subtitles =
    normalized.subtitles ??
    ((await confirm({
      message: "Burn captions into the final video?",
      default: true,
    }))
      ? "burn"
      : "skip");

  const subtitlePlacement =
    subtitles === "burn"
      ? normalized.subtitlePlacement ?? (await resolveSubtitlePlacement({ placement: normalized.subtitlePlacement }))
      : undefined;

  return {
    url: normalized.url,
    range: {
      startSeconds,
      endSeconds,
      startTimestamp: formatTimestamp(startSeconds),
      endTimestamp: formatTimestamp(endSeconds),
    },
    mode,
    subtitles,
    subtitlePlacement,
    output: normalized.output,
    open: normalized.open,
    dryRun: normalized.dryRun,
    keepTemp: normalized.keepTemp,
    debug: normalized.debug,
    nonInteractive: normalized.nonInteractive,
    cwd: normalized.cwd,
  };
}

export function finalizeNonInteractiveOptions(normalized: NormalizedCliOptions): ExecutionOptions {
  if (
    normalized.startSeconds === undefined ||
    normalized.endSeconds === undefined ||
    normalized.mode === undefined ||
    normalized.subtitles === undefined
  ) {
    throw new AppError("Missing required flags for non-interactive usage.", {
      code: "MISSING_FLAGS",
      hint: "Provide --start, --end, --mode, and --subs when using --non-interactive.",
    });
  }

  validateTimeRange(normalized.startSeconds, normalized.endSeconds);

  return {
    url: normalized.url,
    range: {
      startSeconds: normalized.startSeconds,
      endSeconds: normalized.endSeconds,
      startTimestamp: formatTimestamp(normalized.startSeconds),
      endTimestamp: formatTimestamp(normalized.endSeconds),
    },
    mode: normalized.mode,
    subtitles: normalized.subtitles,
    subtitlePlacement: normalized.subtitles === "burn" ? normalized.subtitlePlacement : undefined,
    output: normalized.output,
    open: normalized.open,
    dryRun: normalized.dryRun,
    keepTemp: normalized.keepTemp,
    debug: normalized.debug,
    nonInteractive: normalized.nonInteractive,
    cwd: normalized.cwd,
  };
}

export async function promptContinueWithoutSubtitles(
  message = "English subtitles were not found. Continue without subtitles?",
): Promise<boolean> {
  return confirm({
    message,
    default: true,
  });
}

export function buildPlacementFromFlags(
  preset: SubtitlePositionPreset,
  options: {
    sizePreset?: SubtitleSizePreset;
    stylePreset?: SubtitleStylePreset;
    alignment?: number;
    marginV?: number;
    marginL?: number;
    marginR?: number;
    fontSize?: number;
    outline?: number;
    shadow?: number;
    bold?: boolean;
  },
): SubtitlePlacement {
  let base = buildPlacementFromPreset(preset);

  if (options.sizePreset) {
    base = applySubtitleSizePreset(base, options.sizePreset);
  }

  if (options.stylePreset) {
    base = applySubtitleStylePreset(base, options.stylePreset);
  }

  return {
    ...base,
    preset,
    label: preset === "custom" ? "Custom" : base.label,
    textPreset: base.textPreset,
    alignment: options.alignment ?? base.alignment,
    marginV: options.marginV ?? base.marginV,
    marginL: options.marginL ?? base.marginL,
    marginR: options.marginR ?? base.marginR,
    fontSize: options.fontSize ?? base.fontSize,
    outline: options.outline ?? base.outline,
    shadow: options.shadow ?? base.shadow,
    bold: options.bold ?? base.bold,
  };
}

export function validateSubtitlePlacement(placement: SubtitlePlacement): void {
  if (!Number.isInteger(placement.alignment) || placement.alignment < 1 || placement.alignment > 9) {
    throw new AppError("Subtitle alignment must be between 1 and 9.", {
      code: "SUBTITLE_ALIGNMENT_INVALID",
    });
  }

  for (const [key, value] of Object.entries({
    marginV: placement.marginV,
    marginL: placement.marginL,
    marginR: placement.marginR,
    fontSize: placement.fontSize,
    outline: placement.outline,
    shadow: placement.shadow,
  })) {
    if (!Number.isInteger(value) || value < 0) {
      throw new AppError(`Subtitle ${key} must be a non-negative whole number.`, {
        code: "SUBTITLE_PLACEMENT_INVALID",
      });
    }
  }
}
