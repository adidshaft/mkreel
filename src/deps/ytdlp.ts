import path from "node:path";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { execa } from "execa";
import fs from "fs-extra";

import { YT_DLP_VERSION, getManagedToolPath } from "../config.js";
import { AppError } from "../errors.js";
import type { StepLogger, ToolHandle } from "../types.js";

function resolveAssetName(): string {
  if (process.platform === "darwin") {
    return "yt-dlp_macos";
  }

  if (process.platform === "linux") {
    if (process.arch === "arm64") {
      return "yt-dlp_linux_aarch64";
    }

    if (process.arch === "x64") {
      return "yt-dlp_linux";
    }
  }

  if (process.platform === "win32") {
    if (process.arch === "arm64") {
      return "yt-dlp_arm64.exe";
    }

    if (process.arch === "ia32") {
      return "yt-dlp_x86.exe";
    }

    return "yt-dlp.exe";
  }

  throw new AppError(`Unsupported platform for managed yt-dlp: ${process.platform}/${process.arch}`, {
    code: "YTDLP_PLATFORM_UNSUPPORTED",
    hint: "Install yt-dlp system-wide on this platform and re-run mkreel.",
  });
}

function releaseAssetUrl(assetName: string): string {
  return `https://github.com/yt-dlp/yt-dlp/releases/download/${YT_DLP_VERSION}/${assetName}`;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "user-agent": "mkreel/0.1.0",
    },
  });

  if (!response.ok) {
    throw new AppError(`Failed to download ${url}.`, {
      code: "DOWNLOAD_FAILED",
      details: `HTTP ${response.status}`,
    });
  }

  return response.text();
}

async function downloadFile(url: string, destinationPath: string): Promise<void> {
  const response = await fetch(url, {
    headers: {
      "user-agent": "mkreel/0.1.0",
    },
  });

  if (!response.ok || !response.body) {
    throw new AppError(`Failed to download ${url}.`, {
      code: "DOWNLOAD_FAILED",
      details: `HTTP ${response.status}`,
    });
  }

  await fs.ensureDir(path.dirname(destinationPath));
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destinationPath));
}

async function sha256OfFile(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = fs.createReadStream(filePath);

  return new Promise((resolve, reject) => {
    stream.on("data", (chunk: Buffer) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function verifyYtDlp(executablePath: string): Promise<void> {
  await execa(executablePath, ["--version"], {
    stdout: "ignore",
    stderr: "ignore",
  });
}

export async function ensureManagedYtDlp(logger: StepLogger): Promise<ToolHandle> {
  const assetName = resolveAssetName();
  const targetPath = getManagedToolPath("yt-dlp", YT_DLP_VERSION);

  if (await fs.pathExists(targetPath)) {
    try {
      await verifyYtDlp(targetPath);
      return {
        path: targetPath,
        source: "managed",
        versionLabel: YT_DLP_VERSION,
      };
    } catch {
      await fs.remove(targetPath);
    }
  }

  logger.setText("Setting up video tools for first use...");

  const sums = await fetchText(releaseAssetUrl("SHA2-256SUMS"));
  const expectedHash = sums
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.endsWith(assetName))
    ?.split(/\s+/)[0]
    ?.toLowerCase();

  if (!expectedHash) {
    throw new AppError("Could not verify the yt-dlp download.", {
      code: "YTDLP_HASH_MISSING",
      hint: "Re-run with --debug or try again in a moment.",
    });
  }

  const tempPath = `${targetPath}.download`;
  await downloadFile(releaseAssetUrl(assetName), tempPath);

  const actualHash = await sha256OfFile(tempPath);
  if (actualHash !== expectedHash) {
    await fs.remove(tempPath);
    throw new AppError("yt-dlp download failed integrity verification.", {
      code: "YTDLP_HASH_MISMATCH",
      details: `Expected ${expectedHash} but received ${actualHash}.`,
    });
  }

  if (process.platform !== "win32") {
    await fs.chmod(tempPath, 0o755);
  }

  await fs.move(tempPath, targetPath, { overwrite: true });

  try {
    await verifyYtDlp(targetPath);
  } catch (error) {
    throw new AppError("Managed yt-dlp failed its health check.", {
      code: "YTDLP_VERIFY_FAILED",
      details: error instanceof Error ? error.message : String(error),
      cause: error,
    });
  }

  return {
    path: targetPath,
    source: "managed",
    versionLabel: YT_DLP_VERSION,
  };
}
