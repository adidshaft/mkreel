import path from "node:path";

import { execa } from "execa";
import fs from "fs-extra";

import { AppError } from "../errors.js";
import { formatTimestamp } from "../time.js";
import type {
  ClipRange,
  DownloadArtifacts,
  JobWorkspace,
  ResolvedTools,
  SubtitleAvailability,
  SubtitleDownloadResult,
  VideoMetadata,
} from "../types.js";

interface YtDlpMetadata {
  id?: string;
  title?: string;
  uploader?: string;
  duration?: number;
  subtitles?: Record<string, unknown>;
  automatic_captions?: Record<string, unknown>;
}

function chooseEnglishTrack(tracks: Record<string, unknown> | undefined): string | undefined {
  if (!tracks) {
    return undefined;
  }

  const keys = Object.keys(tracks);
  return (
    keys.find((key) => key === "en") ??
    keys.find((key) => key.startsWith("en-")) ??
    keys.find((key) => key.startsWith("en_"))
  );
}

function parseSubtitleAvailability(metadata: YtDlpMetadata): SubtitleAvailability {
  const manualLanguage = chooseEnglishTrack(metadata.subtitles);
  const automaticLanguage = chooseEnglishTrack(metadata.automatic_captions);

  return {
    manualEnglish: Boolean(manualLanguage),
    automaticEnglish: Boolean(automaticLanguage),
    preferredLanguage: manualLanguage ?? automaticLanguage,
    preferredSource: manualLanguage ? "manual" : automaticLanguage ? "automatic" : undefined,
  };
}

async function runYtDlp(
  executablePath: string,
  args: string[],
  debug: boolean,
): Promise<{ stdout: string; stderr: string }> {
  try {
    const result = await execa(executablePath, args, {
      all: false,
      stdout: "pipe",
      stderr: "pipe",
    });

    return {
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (error) {
    const details =
      error instanceof Error && "stderr" in error && typeof error.stderr === "string"
        ? error.stderr
        : error instanceof Error
          ? error.message
          : String(error);

    throw new AppError("yt-dlp failed while processing the video.", {
      code: "YTDLP_FAILED",
      details,
      hint: debug ? undefined : "Run with --debug to inspect the underlying yt-dlp error.",
      cause: error,
    });
  }
}

export async function fetchVideoMetadata(
  url: string,
  tools: ResolvedTools,
  debug: boolean,
): Promise<VideoMetadata> {
  const { stdout } = await runYtDlp(
    tools.ytDlp.path,
    ["--dump-single-json", "--skip-download", "--no-warnings", "--no-playlist", url],
    debug,
  );

  let parsed: YtDlpMetadata;
  try {
    parsed = JSON.parse(stdout) as YtDlpMetadata;
  } catch (error) {
    throw new AppError("Video metadata could not be parsed.", {
      code: "METADATA_PARSE_FAILED",
      details: error instanceof Error ? error.message : String(error),
      cause: error,
    });
  }

  return {
    id: parsed.id ?? "video",
    title: parsed.title?.trim() || parsed.id || "video",
    uploader: parsed.uploader?.trim() || undefined,
    durationSeconds:
      typeof parsed.duration === "number" && Number.isFinite(parsed.duration)
        ? Math.floor(parsed.duration)
        : undefined,
    subtitleAvailability: parseSubtitleAvailability(parsed),
  };
}

function findSingleProducedFile(directoryPath: string, predicate: (name: string) => boolean): string | undefined {
  const files = fs.readdirSync(directoryPath);
  return files.find(predicate);
}

export async function downloadClip(
  url: string,
  range: ClipRange,
  workspace: JobWorkspace,
  tools: ResolvedTools,
  debug: boolean,
): Promise<string> {
  const outputTemplate = path.join(workspace.downloadsDir, "clip.%(ext)s");
  const { stdout } = await runYtDlp(
    tools.ytDlp.path,
    [
      "--no-warnings",
      "--no-playlist",
      "--force-overwrites",
      "--no-part",
      "--format",
      "bv*+ba/b",
      "--download-sections",
      `*${formatTimestamp(range.startSeconds)}-${formatTimestamp(range.endSeconds)}`,
      "--merge-output-format",
      "mp4",
      "--ffmpeg-location",
      path.dirname(tools.ffmpeg.path),
      "--output",
      outputTemplate,
      "--print",
      "after_move:filepath",
      url,
    ],
    debug,
  );

  const resolvedPath = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);

  if (resolvedPath && (await fs.pathExists(resolvedPath))) {
    return resolvedPath;
  }

  const fallback = findSingleProducedFile(
    workspace.downloadsDir,
    (name) => /\.(mp4|mkv|webm|mov)$/i.test(name),
  );

  if (!fallback) {
    throw new AppError("The clip downloaded, but mkreel could not find the output file.", {
      code: "CLIP_OUTPUT_MISSING",
      hint: "Run again with --debug to keep the workspace for inspection.",
    });
  }

  return path.join(workspace.downloadsDir, fallback);
}

async function locateDownloadedSubtitle(directoryPath: string): Promise<string | undefined> {
  const files = await fs.readdir(directoryPath);
  return files.find((name) => name.toLowerCase().endsWith(".srt"));
}

export async function downloadEnglishSubtitles(
  url: string,
  metadata: VideoMetadata,
  workspace: JobWorkspace,
  tools: ResolvedTools,
  debug: boolean,
): Promise<SubtitleDownloadResult> {
  const language = metadata.subtitleAvailability.preferredLanguage;
  const source = metadata.subtitleAvailability.preferredSource;

  if (!language || !source) {
    throw new AppError("English subtitles are not available for this video.", {
      code: "SUBTITLES_UNAVAILABLE",
    });
  }

  const outputTemplate = path.join(workspace.subtitlesDir, "captions.%(ext)s");
  const args = [
    "--no-warnings",
    "--no-playlist",
    "--skip-download",
    "--sub-langs",
    language,
    "--sub-format",
    "srt/best",
      "--convert-subs",
      "srt",
      "--ffmpeg-location",
      path.dirname(tools.ffmpeg.path),
      "--output",
      outputTemplate,
      url,
  ];

  if (source === "manual") {
    args.splice(3, 0, "--write-subs");
  } else {
    args.splice(3, 0, "--write-auto-subs");
  }

  await runYtDlp(tools.ytDlp.path, args, debug);

  const subtitleFile = await locateDownloadedSubtitle(workspace.subtitlesDir);
  if (!subtitleFile) {
    throw new AppError("Subtitles were requested, but no SRT file was produced.", {
      code: "SUBTITLES_DOWNLOAD_FAILED",
      hint: "Try re-running without subtitles or use --debug to inspect the workspace.",
    });
  }

  return {
    path: path.join(workspace.subtitlesDir, subtitleFile),
    source,
  };
}

export async function downloadRequiredAssets(
  url: string,
  range: ClipRange,
  metadata: VideoMetadata,
  workspace: JobWorkspace,
  tools: ResolvedTools,
  options: {
    includeSubtitles: boolean;
    debug: boolean;
  },
): Promise<DownloadArtifacts> {
  const clipPath = await downloadClip(url, range, workspace, tools, options.debug);

  if (!options.includeSubtitles) {
    return { clipPath };
  }

  const subtitles = await downloadEnglishSubtitles(url, metadata, workspace, tools, options.debug);
  return {
    clipPath,
    subtitlePath: subtitles.path,
    subtitleSource: subtitles.source,
  };
}
