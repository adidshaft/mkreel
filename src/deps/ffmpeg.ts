import path from "node:path";

import { execa } from "execa";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import fs from "fs-extra";

import {
  BUNDLED_FFMPEG_VERSION,
  BUNDLED_FFPROBE_VERSION,
  getManagedToolAliasPath,
  getManagedToolPath,
} from "../config.js";
import { AppError } from "../errors.js";
import type { StepLogger, ToolHandle } from "../types.js";

const ffmpegPath = ffmpegStatic as unknown as string | null;
const ffprobePath = (ffprobeStatic as { path?: string }).path;

async function verifyExecutable(executablePath: string, versionArgs: string[]): Promise<void> {
  await execa(executablePath, versionArgs, {
    stdout: "ignore",
    stderr: "ignore",
  });
}

async function materializeManagedBinary(
  sourcePath: string,
  targetPath: string,
  logger: StepLogger,
): Promise<string> {
  if (!(await fs.pathExists(targetPath))) {
    logger.debug(`Installing managed binary: ${targetPath}`);
    await fs.ensureDir(path.dirname(targetPath));
    await fs.copy(sourcePath, targetPath, { overwrite: true });
    if (process.platform !== "win32") {
      await fs.chmod(targetPath, 0o755);
    }
  }

  return targetPath;
}

async function ensureAlias(versionedPath: string, aliasPath: string): Promise<void> {
  await fs.ensureDir(path.dirname(aliasPath));
  if (await fs.pathExists(aliasPath)) {
    await fs.remove(aliasPath);
  }

  if (process.platform === "win32") {
    await fs.copy(versionedPath, aliasPath, { overwrite: true });
    return;
  }

  const relativeTarget = path.relative(path.dirname(aliasPath), versionedPath);
  try {
    await fs.symlink(relativeTarget, aliasPath);
  } catch {
    await fs.copy(versionedPath, aliasPath, { overwrite: true });
    await fs.chmod(aliasPath, 0o755);
  }
}

export async function ensureManagedFfmpeg(logger: StepLogger): Promise<ToolHandle> {
  if (!ffmpegPath) {
    throw new AppError("Bundled ffmpeg binary is unavailable for this platform.", {
      code: "FFMPEG_BUNDLE_UNAVAILABLE",
      hint: "Install ffmpeg system-wide or run mkreel on a supported platform.",
    });
  }

  const targetPath = getManagedToolPath("ffmpeg", BUNDLED_FFMPEG_VERSION);
  const binaryPath = await materializeManagedBinary(ffmpegPath, targetPath, logger);
  await ensureAlias(binaryPath, getManagedToolAliasPath("ffmpeg"));

  try {
    await verifyExecutable(binaryPath, ["-version"]);
  } catch (error) {
    throw new AppError("Managed ffmpeg failed its health check.", {
      code: "FFMPEG_VERIFY_FAILED",
      details: error instanceof Error ? error.message : String(error),
      cause: error,
    });
  }

  return {
    path: binaryPath,
    source: "managed",
    versionLabel: BUNDLED_FFMPEG_VERSION,
  };
}

export async function ensureManagedFfprobe(logger: StepLogger): Promise<ToolHandle> {
  if (!ffprobePath) {
    throw new AppError("Bundled ffprobe binary is unavailable for this platform.", {
      code: "FFPROBE_BUNDLE_UNAVAILABLE",
      hint: "Install ffprobe system-wide or run mkreel on a supported platform.",
    });
  }

  const targetPath = getManagedToolPath("ffprobe", BUNDLED_FFPROBE_VERSION);
  const binaryPath = await materializeManagedBinary(ffprobePath, targetPath, logger);
  await ensureAlias(binaryPath, getManagedToolAliasPath("ffprobe"));

  try {
    await verifyExecutable(binaryPath, ["-version"]);
  } catch (error) {
    throw new AppError("Managed ffprobe failed its health check.", {
      code: "FFPROBE_VERIFY_FAILED",
      details: error instanceof Error ? error.message : String(error),
      cause: error,
    });
  }

  return {
    path: binaryPath,
    source: "managed",
    versionLabel: BUNDLED_FFPROBE_VERSION,
  };
}

export function escapeFilterValue(value: string): string {
  return value
    .replaceAll("\\", "/")
    .replaceAll(":", "\\:")
    .replaceAll("'", "\\'")
    .replaceAll("[", "\\[")
    .replaceAll("]", "\\]")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;")
    .replaceAll(" ", "\\ ");
}
