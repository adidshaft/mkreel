import path from "node:path";

import { confirm } from "@inquirer/prompts";
import { execa } from "execa";
import fs from "fs-extra";
import { z } from "zod";

import { buildTranscriptContext, loadPackageSidecarContext, titleFromFileName } from "./ai/context.js";
import { getClipSuggestions, getPackageOutput, getSmartRecommendation } from "./ai/index.js";
import { buildPlacementFromCaptionPreset } from "./captions.js";
import { ensureTools } from "./deps/ensureTools.js";
import { AppError, asAppError } from "./errors.js";
import {
  buildPlacementFromFlags,
  collectInteractiveOptions,
  finalizeNonInteractiveOptions,
  type InteractiveOptionDefaults,
  promptContinueWithoutSubtitles,
  validateSubtitlePlacement,
} from "./prompts.js";
import { downloadClip, downloadEnglishSubtitles, fetchVideoMetadata } from "./pipeline/download.js";
import { buildPlannedRun, exportFinalVideo, resolveOutputPath } from "./pipeline/output.js";
import { parseSrt } from "./subtitles/parse.js";
import { shiftSubtitles } from "./subtitles/shift.js";
import { writeSrt } from "./subtitles/write.js";
import { parseTimeInput } from "./time.js";
import type {
  AiProviderPreference,
  ExecutionOptions,
  NormalizedCliOptions,
  RequestedCliOptions,
  StepLogger,
  VideoMetadata,
} from "./types.js";
import {
  printDone,
  printDryRun,
  printPackageOutput,
  printPackageOutputJson,
  printClipSuggestions,
  printClipSuggestionsJson,
  printInteractiveGuide,
  printNote,
  printSmartSuggestion,
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
  smart: z.boolean().optional(),
  ai: z.enum(["auto", "codex", "claude"]).optional(),
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
    smart: parsed.smart ?? false,
    ai: parsed.ai ?? "auto",
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

async function resolveExecutionOptions(
  normalized: NormalizedCliOptions,
  defaults?: InteractiveOptionDefaults,
): Promise<ExecutionOptions> {
  if (normalized.nonInteractive) {
    return finalizeNonInteractiveOptions(normalized);
  }

  return collectInteractiveOptions(normalized, defaults);
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

async function runMaybeStepped<T>(
  label: string,
  debug: boolean,
  quiet: boolean,
  task: () => Promise<T>,
): Promise<T> {
  if (quiet) {
    return task();
  }

  return runStep(label, debug, async () => task());
}

const silentLogger: StepLogger = {
  setText() {},
  debug() {},
};

async function ensureToolsMaybeStepped(debug: boolean, quiet: boolean) {
  if (quiet) {
    return ensureTools(silentLogger);
  }

  return runStep("Checking environment", debug, async (logger) => {
    const ensured = await ensureTools(logger);
    if (ensured.setupPerformed) {
      logger.setText("Preparing video tools");
    }
    return ensured;
  });
}

async function loadSubtitleTranscriptContext(args: {
  url: string;
  metadata: VideoMetadata;
  tools: Awaited<ReturnType<typeof ensureTools>>["tools"];
  debug: boolean;
  quiet?: boolean;
}): Promise<string | undefined> {
  if (!args.metadata.subtitleAvailability.preferredSource) {
    return undefined;
  }

  const workspace = await createJobWorkspace();
  try {
    const downloadedSubtitle = await runMaybeStepped(
      "Loading subtitles for AI suggestions",
      args.debug,
      Boolean(args.quiet),
      async () => {
        return downloadEnglishSubtitles(
          args.url,
          args.metadata,
          workspace,
          args.tools,
          args.debug,
        );
      },
    );

    const subtitleDocument = parseSrt(await fs.readFile(downloadedSubtitle.path, "utf8"));
    if (subtitleDocument.cues.length === 0) {
      return undefined;
    }

    return buildTranscriptContext(subtitleDocument.cues);
  } finally {
    await cleanupWorkspace(workspace);
  }
}

async function maybeResolveSmartSuggestion(args: {
  normalized: NormalizedCliOptions;
  metadata: VideoMetadata;
  tools: Awaited<ReturnType<typeof ensureTools>>["tools"];
}): Promise<{
  normalized: NormalizedCliOptions;
  defaults?: InteractiveOptionDefaults;
}> {
  if (!args.normalized.smart || args.normalized.nonInteractive) {
    return { normalized: args.normalized };
  }

  if (!args.metadata.subtitleAvailability.preferredSource) {
    printWarning("Smart suggestions weren't available, so mkreel will continue with the regular flow.");
    return { normalized: args.normalized };
  }

  try {
    const transcriptText = await loadSubtitleTranscriptContext({
      url: args.normalized.url,
      metadata: args.metadata,
      tools: args.tools,
      debug: args.normalized.debug,
    });

    if (!transcriptText) {
      printWarning("Smart suggestions weren't available, so mkreel will continue with the regular flow.");
      return { normalized: args.normalized };
    }

    const suggestion = await runStep("Thinking through a smart suggestion", args.normalized.debug, async () => {
      return getSmartRecommendation({
        ai: args.normalized.ai,
        cwd: args.normalized.cwd,
        sourceTitle: args.metadata.title,
        uploader: args.metadata.uploader,
        durationSeconds: args.metadata.durationSeconds,
        transcriptText,
        creatorGoal: "Suggest one creator-ready clip for a polished social export.",
      });
    });

    printSmartSuggestion(suggestion.data, suggestion.provider);

    const useSuggestion = await confirm({
      message: "Use this smart suggestion?",
      default: true,
    });

    const defaults: InteractiveOptionDefaults = {
      startSeconds: suggestion.data.startSeconds,
      endSeconds: suggestion.data.endSeconds,
      mode: suggestion.data.mode,
      subtitles: "burn",
      captionPresetId: suggestion.data.captionPreset,
    };

    if (!useSuggestion) {
      return {
        normalized: args.normalized,
        defaults,
      };
    }

    return {
      normalized: {
        ...args.normalized,
        startSeconds: suggestion.data.startSeconds,
        endSeconds: suggestion.data.endSeconds,
        mode: suggestion.data.mode,
        subtitles: "burn",
        subtitlePlacement: buildPlacementFromCaptionPreset(suggestion.data.captionPreset),
      },
      defaults,
    };
  } catch (error) {
    printWarning("Smart suggestions weren't available, so mkreel will continue with the regular flow.");
    if (args.normalized.debug) {
      const normalizedError = asAppError(error, "Smart suggestions failed.");
      if (normalizedError.details) {
        printNote(`Smart mode details: ${normalizedError.details}`);
      } else {
        printNote(`Smart mode details: ${normalizedError.message}`);
      }
    }
    return { normalized: args.normalized };
  }
}

export async function runMkreel(input: RequestedCliOptions): Promise<void> {
  const normalized = normalizeCliOptions(input);
  renderHeader({
    compact: normalized.nonInteractive,
  });
  if (!normalized.nonInteractive) {
    printInteractiveGuide();
  }
  let resolvedNormalized = normalized;
  let interactiveDefaults: InteractiveOptionDefaults | undefined;
  let toolResult: Awaited<ReturnType<typeof ensureTools>> | undefined;
  let metadata: VideoMetadata | undefined;
  let tools: Awaited<ReturnType<typeof ensureTools>>["tools"] | undefined;

  if (normalized.smart && !normalized.nonInteractive) {
    toolResult = await ensureToolsMaybeStepped(normalized.debug, false);
    tools = toolResult.tools;

    metadata = await runStep("Fetching video metadata", normalized.debug, async () => {
      return fetchVideoMetadata(normalized.url, toolResult!.tools, normalized.debug);
    });

    const smartResolution = await maybeResolveSmartSuggestion({
      normalized,
      metadata,
      tools: toolResult.tools,
    });
    resolvedNormalized = smartResolution.normalized;
    interactiveDefaults = smartResolution.defaults;
  }

  let executionOptions = await resolveExecutionOptions(resolvedNormalized, interactiveDefaults);

  let workspace: Awaited<ReturnType<typeof createJobWorkspace>> | undefined;
  let outputPath: string | undefined;
  let keepWorkspace = false;

  try {
    if (!toolResult) {
      toolResult = await ensureToolsMaybeStepped(executionOptions.debug, false);
      tools = toolResult.tools;
    }

    if (!metadata) {
      metadata = await runStep("Fetching video metadata", executionOptions.debug, async () => {
        return fetchVideoMetadata(executionOptions.url, toolResult!.tools, executionOptions.debug);
      });
    }

    const activeToolResult = toolResult;
    const activeMetadata = metadata;

    if (!activeToolResult || !activeMetadata) {
      throw new AppError("mkreel could not prepare the required runtime context.", {
        code: "MKREEL_RUNTIME_SETUP_FAILED",
      });
    }

    validateRangeAgainstMetadata(activeMetadata, executionOptions);

    if (executionOptions.subtitles === "burn" && !activeMetadata.subtitleAvailability.preferredSource) {
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
    outputPath = await resolveOutputPath(executionOptions.cwd, activeMetadata, executionOptions);
    const plan = buildPlannedRun(activeMetadata, executionOptions, activeToolResult.tools, outputPath, jobWorkspace.root);

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
        activeToolResult.tools,
        executionOptions.debug,
      );
    });

    let retimedSubtitlePath: string | undefined;
    if (executionOptions.subtitles === "burn") {
      try {
        const downloadedSubtitle = await runStep("Downloading subtitles", executionOptions.debug, async () => {
          return downloadEnglishSubtitles(
            executionOptions.url,
            activeMetadata,
            jobWorkspace,
            activeToolResult.tools,
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
            outputPath = await resolveOutputPath(executionOptions.cwd, activeMetadata, executionOptions);
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
        tools: activeToolResult.tools,
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

const suggestCommandSchema = z.object({
  url: z.string().trim().min(1),
  ai: z.enum(["auto", "codex", "claude"]).optional(),
  json: z.boolean().optional(),
  debug: z.boolean().optional(),
  cwd: z.string(),
});

const packageCommandSchema = z.object({
  inputPath: z.string().trim().min(1),
  ai: z.enum(["auto", "codex", "claude"]).optional(),
  json: z.boolean().optional(),
  debug: z.boolean().optional(),
  context: z.string().trim().optional(),
  cwd: z.string(),
});

function normalizeSuggestOptions(input: {
  url: string;
  ai?: AiProviderPreference;
  json?: boolean;
  debug?: boolean;
  cwd: string;
}) {
  const parsed = suggestCommandSchema.parse(input);
  return {
    url: validateUrl(parsed.url),
    ai: parsed.ai ?? "auto",
    json: parsed.json ?? false,
    debug: parsed.debug ?? false,
    cwd: parsed.cwd,
  };
}

function normalizePackageCommandOptions(input: {
  inputPath: string;
  ai?: AiProviderPreference;
  json?: boolean;
  debug?: boolean;
  context?: string;
  cwd: string;
}) {
  const parsed = packageCommandSchema.parse(input);
  return {
    inputPath: path.resolve(parsed.cwd, parsed.inputPath),
    ai: parsed.ai ?? "auto",
    json: parsed.json ?? false,
    debug: parsed.debug ?? false,
    context: parsed.context?.trim() || undefined,
    cwd: parsed.cwd,
  };
}

export async function runSuggestCommand(input: {
  url: string;
  ai?: AiProviderPreference;
  json?: boolean;
  debug?: boolean;
  cwd: string;
}): Promise<void> {
  const options = normalizeSuggestOptions(input);
  if (!options.json) {
    renderHeader({
      compact: false,
    });
  }

  const toolResult = await ensureToolsMaybeStepped(options.debug, options.json);
  const metadata = await runMaybeStepped("Fetching video metadata", options.debug, options.json, async () => {
    return fetchVideoMetadata(options.url, toolResult.tools, options.debug);
  });

  if (!metadata.subtitleAvailability.preferredSource) {
    throw new AppError("English subtitles are required to suggest clip ideas for this video.", {
      code: "AI_SUGGEST_SUBTITLES_UNAVAILABLE",
      hint: "Try the regular mkreel flow, or choose a video with English subtitles.",
    });
  }

  const transcriptText = await loadSubtitleTranscriptContext({
    url: options.url,
    metadata,
    tools: toolResult.tools,
    debug: options.debug,
    quiet: options.json,
  });

  if (!transcriptText) {
    throw new AppError("mkreel could not build a transcript context for suggestions.", {
      code: "AI_SUGGEST_TRANSCRIPT_UNAVAILABLE",
    });
  }

  const result = await runMaybeStepped("Scanning the transcript for strong moments", options.debug, options.json, async () => {
    return getClipSuggestions({
      ai: options.ai,
      cwd: options.cwd,
      sourceTitle: metadata.title,
      uploader: metadata.uploader,
      durationSeconds: metadata.durationSeconds,
      transcriptText,
      creatorGoal: "Find three distinct creator-ready short-form moments.",
    });
  });

  if (options.json) {
    printClipSuggestionsJson(metadata, result.data, result.provider);
    return;
  }

  printClipSuggestions(metadata, result.data, result.provider);
}

export async function runPackageCommand(input: {
  inputPath: string;
  ai?: AiProviderPreference;
  json?: boolean;
  debug?: boolean;
  context?: string;
  cwd: string;
}): Promise<void> {
  const options = normalizePackageCommandOptions(input);
  if (!(await fs.pathExists(options.inputPath))) {
    throw new AppError("The file for package mode was not found.", {
      code: "AI_PACKAGE_FILE_MISSING",
      hint: "Pass a real local video file path, for example mkreel package clip.mp4.",
    });
  }

  if (!options.json) {
    renderHeader({
      compact: false,
    });
  }

  const fileName = path.basename(options.inputPath);
  const sidecarContext = await loadPackageSidecarContext(options.inputPath);
  const result = await runMaybeStepped("Building creator publish pack", options.debug, options.json, async () => {
    return getPackageOutput({
      ai: options.ai,
      cwd: options.cwd,
      fileName,
      sidecarContext,
      extraContext: options.context ?? titleFromFileName(options.inputPath),
    });
  });

  if (options.json) {
    printPackageOutputJson(options.inputPath, result.data, result.provider);
    return;
  }

  printPackageOutput(options.inputPath, result.data, result.provider);
}

export { normalizeCliOptions };
