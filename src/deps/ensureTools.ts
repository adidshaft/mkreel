import fs from "fs-extra";
import which from "which";

import { getManagedBinRoot } from "../config.js";
import { AppError } from "../errors.js";
import type { EnsureToolsResult, StepLogger, ToolHandle } from "../types.js";
import { ensureManagedFfmpeg, ensureManagedFfprobe } from "./ffmpeg.js";
import { ensureManagedYtDlp } from "./ytdlp.js";

async function verifySystemTool(
  binaryName: string,
  versionArgs: string[],
): Promise<ToolHandle | undefined> {
  try {
    const resolvedPath = await which(binaryName);
    const { execa } = await import("execa");
    await execa(resolvedPath, versionArgs, {
      stdout: "ignore",
      stderr: "ignore",
    });
    return {
      path: resolvedPath,
      source: "system",
    };
  } catch {
    return undefined;
  }
}

export async function ensureTools(logger: StepLogger): Promise<EnsureToolsResult> {
  await fs.ensureDir(getManagedBinRoot());

  let setupPerformed = false;

  logger.setText("Checking environment");
  const systemFfmpeg = await verifySystemTool("ffmpeg", ["-version"]);
  const systemFfprobe = await verifySystemTool("ffprobe", ["-version"]);
  const systemYtDlp = await verifySystemTool("yt-dlp", ["--version"]);

  const ffmpeg = systemFfmpeg ?? (setupPerformed = true, await ensureManagedFfmpeg(logger));
  const ffprobe = systemFfprobe ?? (setupPerformed = true, await ensureManagedFfprobe(logger));
  const ytDlp = systemYtDlp ?? (setupPerformed = true, await ensureManagedYtDlp(logger));

  if (!ffmpeg.path || !ffprobe.path || !ytDlp.path) {
    throw new AppError("Video tools could not be resolved.", {
      code: "TOOLS_RESOLUTION_FAILED",
    });
  }

  return {
    tools: {
      ffmpeg,
      ffprobe,
      ytDlp,
    },
    setupPerformed,
  };
}
