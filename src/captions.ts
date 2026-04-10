import {
  DEFAULT_BOTTOM_SUBTITLE_PLACEMENT,
  DEFAULT_TOP_SUBTITLE_PLACEMENT,
  applySubtitleSizePreset,
  applySubtitleStylePreset,
  getDefaultCustomSubtitlePlacement,
  getSubtitlePlacementPreset,
} from "./config.js";
import type {
  CaptionPresetId,
  SubtitlePlacement,
  SubtitlePositionPreset,
  SubtitleSizePreset,
  SubtitleStylePreset,
} from "./types.js";

export interface CaptionPresetChoice {
  id: CaptionPresetId;
  label: string;
  placement: SubtitlePositionPreset;
  size: SubtitleSizePreset;
  style: SubtitleStylePreset;
  textPreset: SubtitlePlacement["textPreset"];
}

export const CAPTION_PRESET_CHOICES: CaptionPresetChoice[] = [
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

export function getCaptionPresetChoice(id: CaptionPresetId): CaptionPresetChoice | undefined {
  return CAPTION_PRESET_CHOICES.find((choice) => choice.id === id);
}

export function buildPlacementFromPreset(
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

export function buildPlacementFromCaptionPreset(
  id: CaptionPresetId,
  seed?: SubtitlePlacement,
): SubtitlePlacement {
  const choice = getCaptionPresetChoice(id);
  if (!choice) {
    return buildPlacementFromPreset("bottom", seed);
  }

  let placement = buildPlacementFromPreset(choice.placement, seed);
  placement = applySubtitleSizePreset(placement, choice.size);
  placement = applySubtitleStylePreset(placement, choice.style);

  return {
    ...placement,
    label: choice.label,
    textPreset: choice.textPreset,
  };
}

export function formatCaptionPresetLabel(id: CaptionPresetId): string {
  return getCaptionPresetChoice(id)?.label ?? id;
}
