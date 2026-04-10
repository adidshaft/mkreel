export type OutputMode = "reel" | "original";

export type SubtitleMode = "burn" | "skip";

export type AiProviderName = "codex" | "claude";

export type AiProviderPreference = "auto" | AiProviderName;

export type CaptionPresetId =
  | "bottom-creator"
  | "bottom-compact"
  | "lower-third-clean"
  | "center-punch"
  | "top-clean";

export type SubtitlePositionPreset = "bottom" | "lower-third" | "center" | "top" | "custom";

export type SubtitleSizePreset = "compact" | "balanced" | "large" | "xl" | "custom";

export type SubtitleStylePreset = "creator" | "clean" | "soft" | "custom";

export type SubtitleTextPreset = "balanced" | "compact" | "punch";

export interface SubtitlePlacement {
  preset: SubtitlePositionPreset;
  label: string;
  textPreset: SubtitleTextPreset;
  alignment: number;
  marginV: number;
  marginL: number;
  marginR: number;
  fontSize: number;
  outline: number;
  shadow: number;
  bold: boolean;
}

export interface ClipRange {
  startSeconds: number;
  endSeconds: number;
  startTimestamp: string;
  endTimestamp: string;
}

export interface RequestedCliOptions {
  url: string;
  start?: string;
  end?: string;
  mode?: OutputMode;
  subs?: SubtitleMode;
  smart?: boolean;
  ai?: AiProviderPreference;
  subtitlePosition?: SubtitlePositionPreset;
  subtitleSize?: SubtitleSizePreset;
  subtitleStyle?: SubtitleStylePreset;
  subtitleAlignment?: number;
  subtitleMarginV?: number;
  subtitleMarginL?: number;
  subtitleMarginR?: number;
  subtitleFontSize?: number;
  subtitleOutline?: number;
  subtitleShadow?: number;
  subtitleBold?: boolean;
  output?: string;
  open?: boolean;
  dryRun?: boolean;
  keepTemp?: boolean;
  debug?: boolean;
  nonInteractive?: boolean;
  cwd: string;
}

export interface NormalizedCliOptions {
  url: string;
  startSeconds?: number;
  endSeconds?: number;
  mode?: OutputMode;
  subtitles?: SubtitleMode;
  smart: boolean;
  ai: AiProviderPreference;
  subtitlePlacement?: SubtitlePlacement;
  output?: string;
  open: boolean;
  dryRun: boolean;
  keepTemp: boolean;
  debug: boolean;
  nonInteractive: boolean;
  cwd: string;
}

export interface ExecutionOptions {
  url: string;
  range: ClipRange;
  mode: OutputMode;
  subtitles: SubtitleMode;
  subtitlePlacement?: SubtitlePlacement;
  output?: string;
  open: boolean;
  dryRun: boolean;
  keepTemp: boolean;
  debug: boolean;
  nonInteractive: boolean;
  cwd: string;
}

export interface ToolHandle {
  path: string;
  source: "system" | "managed";
  versionLabel?: string;
}

export interface ResolvedTools {
  ffmpeg: ToolHandle;
  ffprobe: ToolHandle;
  ytDlp: ToolHandle;
}

export interface EnsureToolsResult {
  tools: ResolvedTools;
  setupPerformed: boolean;
}

export interface SubtitleAvailability {
  manualEnglish: boolean;
  automaticEnglish: boolean;
  preferredLanguage?: string;
  preferredSource?: "manual" | "automatic";
}

export interface VideoMetadata {
  id: string;
  title: string;
  uploader?: string;
  durationSeconds?: number;
  subtitleAvailability: SubtitleAvailability;
}

export interface DownloadArtifacts {
  clipPath: string;
  subtitlePath?: string;
  subtitleSource?: "manual" | "automatic";
}

export interface JobWorkspace {
  root: string;
  downloadsDir: string;
  subtitlesDir: string;
  stagingDir: string;
}

export interface SubtitleCue {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
}

export interface SubtitleDocument {
  cues: SubtitleCue[];
}

export interface PlannedRun {
  sourceTitle: string;
  outputPath: string;
  stages: string[];
  tools: ResolvedTools;
  jobRoot: string;
}

export interface SubtitleDownloadResult {
  path: string;
  source: "manual" | "automatic";
}

export interface VideoCanvas {
  width: number;
  height: number;
}

export interface StepLogger {
  setText(text: string): void;
  debug(message: string): void;
}
