import path from "node:path";
import { randomUUID } from "node:crypto";

import fs from "fs-extra";

import { getJobsRoot } from "./config.js";
import type { JobWorkspace } from "./types.js";

export async function createJobWorkspace(): Promise<JobWorkspace> {
  const stamp = new Date().toISOString().replaceAll(":", "-");
  const root = path.join(getJobsRoot(), `${stamp}-${randomUUID().slice(0, 8)}`);
  const downloadsDir = path.join(root, "downloads");
  const subtitlesDir = path.join(root, "subtitles");
  const stagingDir = path.join(root, "staging");

  await fs.ensureDir(downloadsDir);
  await fs.ensureDir(subtitlesDir);
  await fs.ensureDir(stagingDir);

  return {
    root,
    downloadsDir,
    subtitlesDir,
    stagingDir,
  };
}

export async function cleanupWorkspace(workspace: JobWorkspace): Promise<void> {
  await fs.remove(workspace.root);
}
