import os from "node:os";
import path from "node:path";

import type {
  SubtitlePlacement,
  SubtitlePositionPreset,
  SubtitleSizePreset,
  SubtitleStylePreset,
  SubtitleTextPreset,
} from "./types.js";

export const APP_NAME = "mkreel";
export const APP_TAGLINE = "Clip YouTube moments into creator-ready reels.";
export const CACHE_OVERRIDE_ENV = "MKREEL_HOME";
export const BUNDLED_FFMPEG_VERSION = "5.3.0";
export const BUNDLED_FFPROBE_VERSION = "3.1.0";
export const YT_DLP_VERSION = "2026.03.17";
export const OUTPUT_VIDEO_CODEC = "libx264";
export const OUTPUT_AUDIO_CODEC = "aac";
export const OUTPUT_AUDIO_BITRATE = "192k";
export const REEL_WIDTH = 1080;
export const REEL_HEIGHT = 1920;

export const DEFAULT_SUBTITLE_COLORS = {
  primaryColour: "&H00FFFFFF",
  outlineColour: "&H00000000",
  backColour: "&H64000000",
  borderStyle: 1,
  outline: 3,
  shadow: 1,
};

function createSubtitlePlacement(input: {
  preset: SubtitlePositionPreset;
  label: string;
  textPreset?: SubtitleTextPreset;
  alignment: number;
  marginV: number;
  marginL?: number;
  marginR?: number;
  fontSize?: number;
  outline?: number;
  shadow?: number;
  bold?: boolean;
}): SubtitlePlacement {
  return {
    preset: input.preset,
    label: input.label,
    textPreset: input.textPreset ?? "balanced",
    alignment: input.alignment,
    marginV: input.marginV,
    marginL: input.marginL ?? 96,
    marginR: input.marginR ?? 96,
    fontSize: input.fontSize ?? 70,
    outline: input.outline ?? 4,
    shadow: input.shadow ?? 1,
    bold: input.bold ?? true,
  };
}

export function getSubtitlePlacementPreset(preset: SubtitlePositionPreset): SubtitlePlacement {
  switch (preset) {
    case "bottom":
      return createSubtitlePlacement({
        preset,
        label: "Bottom safe",
        textPreset: "balanced",
        alignment: 2,
        marginV: 220,
      });
    case "lower-third":
      return createSubtitlePlacement({
        preset,
        label: "Lower third",
        textPreset: "balanced",
        alignment: 2,
        marginV: 360,
      });
    case "center":
      return createSubtitlePlacement({
        preset,
        label: "Center emphasis",
        textPreset: "punch",
        alignment: 5,
        marginV: 0,
      });
    case "top":
      return createSubtitlePlacement({
        preset,
        label: "Top safe",
        textPreset: "balanced",
        alignment: 8,
        marginV: 180,
      });
    case "custom":
      return createSubtitlePlacement({
        preset,
        label: "Custom",
        textPreset: "balanced",
        alignment: 2,
        marginV: 220,
      });
  }
}

export const DEFAULT_BOTTOM_SUBTITLE_PLACEMENT = getSubtitlePlacementPreset("bottom");
export const DEFAULT_TOP_SUBTITLE_PLACEMENT = getSubtitlePlacementPreset("top");

export function getDefaultCustomSubtitlePlacement(): SubtitlePlacement {
  return getSubtitlePlacementPreset("custom");
}

export function applySubtitleSizePreset(
  placement: SubtitlePlacement,
  preset: SubtitleSizePreset,
): SubtitlePlacement {
  switch (preset) {
    case "compact":
      return {
        ...placement,
        fontSize: 58,
        outline: 3,
      };
    case "balanced":
      return {
        ...placement,
        fontSize: 70,
        outline: 4,
      };
    case "large":
      return {
        ...placement,
        fontSize: 82,
        outline: 5,
      };
    case "xl":
      return {
        ...placement,
        fontSize: 94,
        outline: 6,
      };
    case "custom":
      return placement;
  }
}

export function applySubtitleStylePreset(
  placement: SubtitlePlacement,
  preset: SubtitleStylePreset,
): SubtitlePlacement {
  switch (preset) {
    case "creator":
      return {
        ...placement,
        bold: true,
        outline: Math.max(placement.outline, 5),
        shadow: 1,
      };
    case "clean":
      return {
        ...placement,
        bold: false,
        outline: 4,
        shadow: 0,
      };
    case "soft":
      return {
        ...placement,
        bold: false,
        outline: 3,
        shadow: 2,
      };
    case "custom":
      return placement;
  }
}

export function getCacheRoot(): string {
  const override = process.env[CACHE_OVERRIDE_ENV];
  if (override) {
    return path.resolve(override);
  }

  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Caches", APP_NAME);
  }

  if (process.platform === "win32") {
    const localAppData =
      process.env.LOCALAPPDATA ??
      path.join(os.homedir(), "AppData", "Local");
    return path.join(localAppData, APP_NAME, "Cache");
  }

  const xdgCache = process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache");
  return path.join(xdgCache, APP_NAME);
}

export function getManagedBinRoot(): string {
  return path.join(getCacheRoot(), "bin");
}

export function getJobsRoot(): string {
  return path.join(getCacheRoot(), "jobs");
}

export function getManagedToolPath(toolName: string, version: string): string {
  const suffix = process.platform === "win32" ? ".exe" : "";
  return path.join(getManagedBinRoot(), `${toolName}-${version}${suffix}`);
}

export function getManagedToolAliasPath(toolName: string): string {
  const suffix = process.platform === "win32" ? ".exe" : "";
  return path.join(getManagedBinRoot(), `${toolName}${suffix}`);
}
