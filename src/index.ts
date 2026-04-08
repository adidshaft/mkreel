import path from "node:path";

import { execa } from "execa";
import fs from "fs-extra";
import { z } from "zod";

import { ensureTools } from "./deps/ensureTools.js";
import { AppError } from "./errors.js";
import {
  buildPlacementFromFlags,
  collectInteractiveOptions,
  finalizeNonInteractiveOptions,
  promptContinueWithoutSubtitles,
  validateSubtitlePlacement,
} from "./prompts.js";
import { downloadClip, downloadEnglishSubtitles, fetchVideoMetadata } from "./pipeline/download.js";
import { buildPlannedRun, exportFinalVideo, resolveOutputPath } from "./pipeline/output.js";
import { parseSrt } from "./subtitles/parse.js";
import { shiftSubtitles } from "./subtitles/shift.js";
import { writeSrt } from "./subtitles/write.js";
import { parseTimeInput } from "./time.js";
import type { ExecutionOptions, NormalizedCliOptions, RequestedCliOptions, VideoMetadata } from "./types.js";
import {
  printDone,
  printDryRun,
  printInteractiveGuide,
  printNote,
  printSummary,
  printWarning,
  renderHeader,
  runStep,
} from "./ui/index.js";
import { cleanupWorkspace, createJobWorkspace } from "./workspace.js";

const optionSchema = z.object({
  url: z.string().trim().min(1),
  start: z.string().trim().optional(),
  end: z.string().trim().optional(),
  mode: z.enum(["reel", "original"]).optional(),
  subs: z.enum(["burn", "skip"]).optional(),
  subtitlePosition: z.enum(["bottom", "lower-third", "center", "top", "custom"]).optional(),
  subtitleSize: z.enum(["compact", "balanced", "large", "xl", "custom"]).optional(),
  subtitleStyle: z.enum(["creator", "clean", "soft", "custom"]).optional(),
  subtitleAlignment: z.number().int().optional(),
  subtitleMarginV: z.number().int().optional(),
  subtitleMarginL: z.number().int().optional(),
  subtitleMarginR: z.number().int().optional(),
  subtitleFontSize: z.number().int().optional(),
  subtitleOutline: z.number().int().optional(),
  subtitleShadow: z.number().int().optional(),
  subtitleBold: z.boolean().optional(),
  output: z.string().trim().optional(),
  open: z.boolean().optional(),
  dryRun: z.boolean().optional(),
  keepTemp: z.boolean().optional(),
  debug: z.boolean().optional(),
  nonInteractive: z.boolean().optional(),
  cwd: z.string(),
});

function validateUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch (error) {
    throw new AppError("Please provide a valid YouTube URL.", {
      code: "URL_INVALID",
      hint: "Example: mkreel https://www.youtube.com/watch?v=...",
      cause: error,
    });
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new AppError("Only http and https URLs are supported.", {
      code: "URL_PROTOCOL_INVALID",
    });
  }

  const hostname = parsed.hostname.toLowerCase();
  const supported =
    hostname === "youtu.be" ||
    hostname === "youtube.com" ||
    hostname.endsWith(".youtube.com");

  if (!supported) {
    throw new AppError("mkreel currently supports YouTube URLs only.", {
      code: "URL_HOST_UNSUPPORTED",
      hint: "Use a youtube.com or youtu.be link.",
    });
  }

  return parsed.toString();
}

function validateRangeAgainstMetadata(metadata: VideoMetadata, options: ExecutionOptions): void {
  const duration = metadata.durationSeconds;
  if (duration === undefined) {
    return;
  }

  if (options.range.startSeconds >= duration) {
    throw new AppError("The clip start time is past the end of the source video.", {
      code: "START_PAST_VIDEO",
      hint: `The source video is ${duration} seconds long.`,
    });
  }

  if (options.range.endSeconds > duration) {
    throw new AppError("The clip end time is past the end of the source video.", {
      code: "END_PAST_VIDEO",
      hint: `The source video is ${duration} seconds long.`,
    });
  }
}

async function maybeOpenFile(outputPath: string): Promise<void> {
  if (process.platform === "darwin") {
    await execa("open", [outputPath], { stdout: "ignore", stderr: "ignore" });
    return;
  }

  if (process.platform === "win32") {
    await execa("cmd", ["/c", "start", "", outputPath], {
      windowsHide: true,
      stdout: "ignore",
      stderr: "ignore",
    });
    return;
  }

  await execa("xdg-open", [outputPath], { stdout: "ignore", stderr: "ignore" });
}

function normalizeCliOptions(input: RequestedCliOptions): NormalizedCliOptions {
  const parsed = optionSchema.parse(input);
  const nonInteractive =
    parsed.nonInteractive ?? !(Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY));

  const normalized: NormalizedCliOptions = {
    url: validateUrl(parsed.url),
    startSeconds: parsed.start ? parseTimeInput(parsed.start) : undefined,
    endSeconds: parsed.end ? parseTimeInput(parsed.end) : undefined,
    mode: parsed.mode,
    subtitles: parsed.subs,
    subtitlePlacement:
      parsed.subs === "burn" ||
      parsed.subtitlePosition ||
      parsed.subtitleSize ||
      parsed.subtitleStyle ||
      parsed.subtitleAlignment !== undefined ||
      parsed.subtitleMarginV !== undefined ||
      parsed.subtitleMarginL !== undefined ||
      parsed.subtitleMarginR !== undefined ||
      parsed.subtitleFontSize !== undefined ||
      parsed.subtitleOutline !== undefined ||
      parsed.subtitleShadow !== undefined ||
      parsed.subtitleBold !== undefined
        ? buildPlacementFromFlags(parsed.subtitlePosition ?? "bottom", {
            sizePreset: parsed.subtitleSize,
            stylePreset: parsed.subtitleStyle,
            alignment: parsed.subtitleAlignment,
            marginV: parsed.subtitleMarginV,
            marginL: parsed.subtitleMarginL,
            marginR: parsed.subtitleMarginR,
            fontSize: parsed.subtitleFontSize,
            outline: parsed.subtitleOutline,
            shadow: parsed.subtitleShadow,
            bold: parsed.subtitleBold,
          })
        : undefined,
    output: parsed.output || undefined,
    open: parsed.open ?? false,
    dryRun: parsed.dryRun ?? false,
    keepTemp: parsed.keepTemp ?? false,
    debug: parsed.debug ?? false,
    nonInteractive,
    cwd: parsed.cwd,
  };

  if (normalized.subtitlePlacement) {
    validateSubtitlePlacement(normalized.subtitlePlacement);
  }

  return normalized;
}

async function resolveExecutionOptions(normalized: NormalizedCliOptions): Promise<ExecutionOptions> {
  if (normalized.nonInteractive) {
    return finalizeNonInteractiveOptions(normalized);
  }

  return collectInteractiveOptions(normalized);
}

async function buildRetimedSubtitleFile(
  inputPath: string,
  outputPath: string,
  clipStartSeconds: number,
): Promise<void> {
  const sourceContent = await fs.readFile(inputPath, "utf8");

  const parsed = parseSrt(sourceContent);
  const shifted = shiftSubtitles(parsed, clipStartSeconds * 1000);
  if (shifted.cues.length === 0) {
    throw new AppError("The requested clip does not contain any subtitle cues after retiming.", {
      code: "SUBTITLES_EMPTY_AFTER_SHIFT",
    });
  }
  await writeSrt(shifted, outputPath);
}

export async function runMkreel(input: RequestedCliOptions): Promise<void> {
  const normalized = normalizeCliOptions(input);
  renderHeader({
    compact: normalized.nonInteractive,
  });
  if (!normalized.nonInteractive) {
    printInteractiveGuide();
  }
  let executionOptions = await resolveExecutionOptions(normalized);

  let workspace: Awaited<ReturnType<typeof createJobWorkspace>> | undefined;
  let outputPath: string | undefined;
  let keepWorkspace = false;
  let tools: Awaited<ReturnType<typeof ensureTools>>["tools"] | undefined;

  try {
    const toolResult = await runStep("Checking environment", executionOptions.debug, async (logger) => {
      const ensured = await ensureTools(logger);
      if (ensured.setupPerformed) {
        logger.setText("Preparing video tools");
      }
      return ensured;
    });
    tools = toolResult.tools;

    const metadata = await runStep("Fetching video metadata", executionOptions.debug, async () => {
      return fetchVideoMetadata(executionOptions.url, toolResult.tools, executionOptions.debug);
    });

    validateRangeAgainstMetadata(metadata, executionOptions);

    if (executionOptions.subtitles === "burn" && !metadata.subtitleAvailability.preferredSource) {
      if (executionOptions.nonInteractive) {
        throw new AppError("Subtitles were requested, but English subtitles are not available.", {
          code: "SUBTITLES_UNAVAILABLE",
          hint: "Use --subs skip to continue without burning subtitles.",
        });
      }

      const shouldContinue = await promptContinueWithoutSubtitles();
      if (!shouldContinue) {
        throw new AppError("Cancelled before export.", {
          code: "USER_CANCELLED",
        });
      }

      executionOptions = {
        ...executionOptions,
        subtitles: "skip",
        subtitlePlacement: undefined,
      };
    }

    workspace = await createJobWorkspace();
    const jobWorkspace = workspace;
    outputPath = await resolveOutputPath(executionOptions.cwd, metadata, executionOptions);
    const plan = buildPlannedRun(metadata, executionOptions, toolResult.tools, outputPath, jobWorkspace.root);

    printSummary(executionOptions, plan);

    if (executionOptions.dryRun) {
      printDryRun(plan);
      return;
    }

    const clipPath = await runStep("Downloading clip", executionOptions.debug, async () => {
      return downloadClip(
        executionOptions.url,
        executionOptions.range,
        jobWorkspace,
        toolResult.tools,
        executionOptions.debug,
      );
    });

    let retimedSubtitlePath: string | undefined;
    if (executionOptions.subtitles === "burn") {
      try {
        const downloadedSubtitle = await runStep("Downloading subtitles", executionOptions.debug, async () => {
          return downloadEnglishSubtitles(
            executionOptions.url,
            metadata,
            jobWorkspace,
            toolResult.tools,
            executionOptions.debug,
          );
        });

        retimedSubtitlePath = path.join(jobWorkspace.stagingDir, "captions.retimed.srt");
        await runStep("Retiming subtitles", executionOptions.debug, async () => {
          await buildRetimedSubtitleFile(
            downloadedSubtitle.path,
            retimedSubtitlePath!,
            executionOptions.range.startSeconds,
          );
        });
      } catch (error) {
        if (!executionOptions.nonInteractive) {
          const shouldContinue = await promptContinueWithoutSubtitles(
            "Subtitles could not be downloaded cleanly. Continue without subtitles?",
          );
          if (shouldContinue) {
            executionOptions = {
              ...executionOptions,
              subtitles: "skip",
              subtitlePlacement: undefined,
            };
            outputPath = await resolveOutputPath(executionOptions.cwd, metadata, executionOptions);
            printWarning("Continuing without subtitles.");
            printNote(`Output updated to ${outputPath}`);
          } else {
            throw error;
          }
        } else {
          throw error;
        }
      }
    }

    const exportLabel =
      executionOptions.mode === "reel"
        ? executionOptions.subtitles === "burn"
          ? "Exporting reel with subtitles"
          : "Building reel"
        : executionOptions.subtitles === "burn"
          ? "Burning subtitles"
          : "Exporting final video";

    await runStep(exportLabel, executionOptions.debug, async () => {
      await exportFinalVideo({
        tools: toolResult.tools,
        inputPath: clipPath,
        outputPath: outputPath!,
        mode: executionOptions.mode,
        subtitlePath: retimedSubtitlePath,
        subtitlePlacement: executionOptions.subtitlePlacement,
        debug: executionOptions.debug,
      });
    });

    keepWorkspace = executionOptions.keepTemp;
    if (executionOptions.open) {
      try {
        await maybeOpenFile(outputPath);
      } catch {
        printWarning("The file was created, but mkreel could not open it automatically.");
      }
    }

    printDone(outputPath, {
      tempPath: keepWorkspace ? workspace.root : undefined,
    });
  } catch (error) {
    if (workspace) {
      keepWorkspace = true;
      printNote(`Temp workspace preserved at ${workspace.root}`);
    }
    throw error;
  } finally {
    if (workspace && !keepWorkspace) {
      await cleanupWorkspace(workspace);
    }

    if (tools && normalized.debug && outputPath) {
      printNote(`Used tools: ffmpeg=${tools.ffmpeg.path} | yt-dlp=${tools.ytDlp.path}`);
    }
  }
}

export { normalizeCliOptions };
