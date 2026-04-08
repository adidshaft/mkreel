import path from "node:path";

import { execa } from "execa";
import fs from "fs-extra";
import sanitizeFilename from "sanitize-filename";

import {
  OUTPUT_AUDIO_BITRATE,
  OUTPUT_AUDIO_CODEC,
  OUTPUT_VIDEO_CODEC,
  REEL_HEIGHT,
  REEL_WIDTH,
} from "../config.js";
import { AppError } from "../errors.js";
import { parseSrt } from "../subtitles/parse.js";
import { writeAss } from "../subtitles/ass.js";
import { formatFilenameTimestamp } from "../time.js";
import type {
  ExecutionOptions,
  PlannedRun,
  ResolvedTools,
  SubtitlePlacement,
  VideoCanvas,
  VideoMetadata,
} from "../types.js";
import { buildSubtitleFilter } from "./burn.js";
import { buildReelFilter } from "./reel.js";

function slugifyTitle(title: string): string {
  const sanitized = sanitizeFilename(title)
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return sanitized.slice(0, 80) || "video";
}

async function ensureAvailablePath(targetPath: string): Promise<string> {
  if (!(await fs.pathExists(targetPath))) {
    return targetPath;
  }

  const parsed = path.parse(targetPath);
  let counter = 2;

  while (true) {
    const nextPath = path.join(parsed.dir, `${parsed.name}-${counter}${parsed.ext}`);
    if (!(await fs.pathExists(nextPath))) {
      return nextPath;
    }
    counter += 1;
  }
}

export function buildOutputFilename(
  metadata: VideoMetadata,
  options: Pick<ExecutionOptions, "range" | "mode" | "subtitles">,
): string {
  const titleSlug = slugifyTitle(metadata.title);
  const modeLabel = options.mode === "reel" ? "reel" : "original";
  const subtitleLabel = options.subtitles === "burn" ? "-subbed" : "";
  return `${titleSlug}-${formatFilenameTimestamp(options.range.startSeconds)}-${formatFilenameTimestamp(options.range.endSeconds)}-${modeLabel}${subtitleLabel}.mp4`;
}

export async function resolveOutputPath(
  cwd: string,
  metadata: VideoMetadata,
  options: Pick<ExecutionOptions, "range" | "mode" | "subtitles" | "output">,
): Promise<string> {
  const rawPath = options.output
    ? path.resolve(cwd, options.output)
    : path.resolve(cwd, buildOutputFilename(metadata, options));

  const normalizedPath = path.extname(rawPath) ? rawPath : `${rawPath}.mp4`;
  await fs.ensureDir(path.dirname(normalizedPath));
  return ensureAvailablePath(normalizedPath);
}

export function buildPlannedStages(options: ExecutionOptions): string[] {
  const stages = ["Download selected clip"];
  if (options.subtitles === "burn") {
    stages.push("Download English subtitles", "Retime subtitles");
  }
  stages.push(options.mode === "reel" ? "Render reel layout" : "Render original layout");
  return stages;
}

export function buildPlannedRun(
  metadata: VideoMetadata,
  options: ExecutionOptions,
  tools: ResolvedTools,
  outputPath: string,
  jobRoot: string,
): PlannedRun {
  return {
    sourceTitle: metadata.title,
    outputPath,
    stages: buildPlannedStages(options),
    tools,
    jobRoot,
  };
}

function buildFilterComplex(
  mode: ExecutionOptions["mode"],
  subtitlePath: string | undefined,
  subtitlePlacement: SubtitlePlacement | undefined,
): { filterComplex: string; outputLabel: string } | undefined {
  const filters: string[] = [];
  let currentLabel = "0:v";

  if (mode === "reel") {
    filters.push(buildReelFilter("0:v", "reelv"));
    currentLabel = "reelv";
  }

  if (subtitlePath && subtitlePlacement) {
    filters.push(buildSubtitleFilter(subtitlePath, currentLabel, "subbedv"));
    currentLabel = "subbedv";
  }

  if (filters.length === 0) {
    return undefined;
  }

  return {
    filterComplex: filters.join(";"),
    outputLabel: currentLabel,
  };
}

export async function exportFinalVideo(args: {
  tools: ResolvedTools;
  inputPath: string;
  outputPath: string;
  mode: ExecutionOptions["mode"];
  subtitlePath?: string;
  subtitlePlacement?: SubtitlePlacement;
  debug: boolean;
}): Promise<void> {
  const styledSubtitlePath =
    args.subtitlePath && args.subtitlePlacement
      ? await prepareStyledSubtitleTrack(
          args.tools.ffprobe.path,
          args.inputPath,
          args.mode,
          args.subtitlePath,
          args.subtitlePlacement,
        )
      : undefined;

  const filter = buildFilterComplex(args.mode, styledSubtitlePath, args.subtitlePlacement);

  if (!filter) {
    await fs.copy(args.inputPath, args.outputPath, { overwrite: true });
    await verifyOutputFile(args.tools.ffprobe.path, args.outputPath);
    return;
  }

  const ffmpegArgs = [
    "-y",
    "-i",
    args.inputPath,
    "-filter_complex",
    filter.filterComplex,
    "-map",
    `[${filter.outputLabel}]`,
    "-map",
    "0:a?",
    "-c:v",
    OUTPUT_VIDEO_CODEC,
    "-preset",
    "medium",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    OUTPUT_AUDIO_CODEC,
    "-b:a",
    OUTPUT_AUDIO_BITRATE,
    "-movflags",
    "+faststart",
    args.outputPath,
  ];

  try {
    await execa(args.tools.ffmpeg.path, ffmpegArgs, {
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch (error) {
    const details =
      error instanceof Error && "stderr" in error && typeof error.stderr === "string"
        ? error.stderr
        : error instanceof Error
          ? error.message
          : String(error);

    throw new AppError("ffmpeg failed while exporting the final video.", {
      code: "FFMPEG_EXPORT_FAILED",
      details,
      hint: args.debug ? undefined : "Run with --debug to inspect the ffmpeg error output.",
      cause: error,
    });
  }

  await verifyOutputFile(args.tools.ffprobe.path, args.outputPath);
}

async function prepareStyledSubtitleTrack(
  ffprobePath: string,
  inputPath: string,
  mode: ExecutionOptions["mode"],
  subtitlePath: string,
  subtitlePlacement: SubtitlePlacement,
): Promise<string> {
  const canvas = await resolveOutputCanvas(ffprobePath, inputPath, mode);
  const subtitleDocument = parseSrt(await fs.readFile(subtitlePath, "utf8"));
  const styledPath = subtitlePath.replace(/\.srt$/i, ".styled.ass");
  await writeAss(subtitleDocument, subtitlePlacement, canvas, styledPath);
  return styledPath;
}

async function resolveOutputCanvas(
  ffprobePath: string,
  inputPath: string,
  mode: ExecutionOptions["mode"],
): Promise<VideoCanvas> {
  if (mode === "reel") {
    return {
      width: REEL_WIDTH,
      height: REEL_HEIGHT,
    };
  }

  return probeVideoCanvas(ffprobePath, inputPath);
}

async function probeVideoCanvas(ffprobePath: string, inputPath: string): Promise<VideoCanvas> {
  try {
    const { stdout } = await execa(
      ffprobePath,
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height",
        "-of",
        "csv=p=0:s=x",
        inputPath,
      ],
      {
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    const [widthRaw, heightRaw] = stdout.trim().split("x");
    const width = Number.parseInt(widthRaw ?? "", 10);
    const height = Number.parseInt(heightRaw ?? "", 10);

    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      throw new Error(`Invalid canvas response: ${stdout.trim()}`);
    }

    return { width, height };
  } catch (error) {
    throw new AppError("ffprobe could not determine the output video dimensions.", {
      code: "VIDEO_DIMENSIONS_UNKNOWN",
      details: error instanceof Error ? error.message : String(error),
      cause: error,
    });
  }
}

async function verifyOutputFile(ffprobePath: string, outputPath: string): Promise<void> {
  try {
    const { stdout } = await execa(
      ffprobePath,
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        outputPath,
      ],
      {
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    const duration = Number.parseFloat(stdout.trim());
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error("Duration probe returned no usable value.");
    }
  } catch (error) {
    throw new AppError("The final video was written, but ffprobe could not validate it.", {
      code: "OUTPUT_VERIFY_FAILED",
      details: error instanceof Error ? error.message : String(error),
      cause: error,
    });
  }
}
