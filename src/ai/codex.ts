import os from "node:os";
import path from "node:path";

import fs from "fs-extra";
import which from "which";

import { AppError } from "../errors.js";
import type { AiProvider } from "./provider.js";
import type { AiProviderStatus, CommandRunOptions, CommandRunner, StructuredPromptRequest, StructuredPromptResult } from "./provider.js";

interface CodexLaunchSpec {
  command: string;
  argsPrefix: string[];
}

async function runWithSpec(
  runner: CommandRunner,
  spec: CodexLaunchSpec,
  args: string[],
  options?: CommandRunOptions,
) {
  return runner.run(spec.command, [...spec.argsPrefix, ...args], options);
}

function makeArchSpecs(binaryPath: string): CodexLaunchSpec[] {
  const specs: CodexLaunchSpec[] = [];

  if (process.platform === "darwin") {
    if (binaryPath.includes("aarch64-apple-darwin")) {
      specs.push({
        command: "arch",
        argsPrefix: ["-arm64", binaryPath],
      });
    }

    if (binaryPath.includes("x86_64-apple-darwin")) {
      specs.push({
        command: "arch",
        argsPrefix: ["-x86_64", binaryPath],
      });
    }
  }

  specs.push({
    command: binaryPath,
    argsPrefix: [],
  });

  return specs;
}

async function resolveCodexWrapperPath(): Promise<string | undefined> {
  try {
    return await which("codex");
  } catch {
    return undefined;
  }
}

async function findVendoredCodexBinaries(wrapperPath: string): Promise<string[]> {
  const wrapperRealPath = await fs.realpath(wrapperPath);
  const packageRoot = path.resolve(wrapperRealPath, "..", "..");
  const scopeDir = path.join(packageRoot, "node_modules", "@openai");

  if (!(await fs.pathExists(scopeDir))) {
    return [];
  }

  const entries = await fs.readdir(scopeDir, { withFileTypes: true });
  const binaries: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("codex-")) {
      continue;
    }

    const vendorRoot = path.join(scopeDir, entry.name, "vendor");
    if (!(await fs.pathExists(vendorRoot))) {
      continue;
    }

    const targetTriples = await fs.readdir(vendorRoot, { withFileTypes: true });
    for (const targetTriple of targetTriples) {
      if (!targetTriple.isDirectory()) {
        continue;
      }

      const binaryPath = path.join(vendorRoot, targetTriple.name, "codex", "codex");
      if (await fs.pathExists(binaryPath)) {
        binaries.push(binaryPath);
      }
    }
  }

  return binaries;
}

async function buildCodexLaunchSpecs(): Promise<CodexLaunchSpec[]> {
  const wrapperPath = await resolveCodexWrapperPath();
  if (!wrapperPath) {
    return [];
  }

  const specs: CodexLaunchSpec[] = [
    {
      command: wrapperPath,
      argsPrefix: [],
    },
  ];

  const vendoredBinaries = await findVendoredCodexBinaries(wrapperPath);
  for (const binaryPath of vendoredBinaries) {
    specs.push(...makeArchSpecs(binaryPath));
  }

  return specs.filter((spec, index, allSpecs) => {
    const key = `${spec.command} ${spec.argsPrefix.join(" ")}`;
    return allSpecs.findIndex((candidate) => `${candidate.command} ${candidate.argsPrefix.join(" ")}` === key) === index;
  });
}

async function resolveWorkingCodexSpec(
  runner: CommandRunner,
): Promise<{ spec?: CodexLaunchSpec; reason?: string }> {
  const specs = await buildCodexLaunchSpecs();
  if (specs.length === 0) {
    return {
      reason: "codex is not installed",
    };
  }

  let lastReason = "codex could not be launched";

  for (const spec of specs) {
    const helpResult = await runWithSpec(runner, spec, ["exec", "--help"], {
      cwd: process.cwd(),
      timeoutMs: 5_000,
    });

    if (helpResult.exitCode === 0 && helpResult.stdout.includes("--output-schema")) {
      const loginResult = await runWithSpec(runner, spec, ["login", "status"], {
        cwd: process.cwd(),
        timeoutMs: 5_000,
      });

      const statusText = `${loginResult.stdout}\n${loginResult.stderr}`.trim();
      if (loginResult.exitCode === 0 && /logged in/i.test(statusText)) {
        return { spec };
      }

      lastReason = statusText
        ? `codex is installed but not ready: ${statusText}`
        : "codex is installed but not signed in";
      continue;
    }

    const helpText = `${helpResult.stderr}\n${helpResult.stdout}`.trim();
    if (helpText) {
      lastReason = helpText;
    }
  }

  return {
    reason: lastReason,
  };
}

export function createCodexProvider(runner: CommandRunner): AiProvider {
  return {
    name: "codex",
    async detect(): Promise<AiProviderStatus> {
      const resolved = await resolveWorkingCodexSpec(runner);
      return {
        name: "codex",
        available: Boolean(resolved.spec),
        reason: resolved.reason,
      };
    },
    async runStructuredPrompt(request: StructuredPromptRequest): Promise<StructuredPromptResult> {
      const resolved = await resolveWorkingCodexSpec(runner);
      if (!resolved.spec) {
        throw new AppError("Codex is not available right now.", {
          code: "AI_CODEX_UNAVAILABLE",
          details: resolved.reason,
        });
      }

      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mkreel-codex-"));
      const schemaPath = path.join(tempRoot, "schema.json");
      const outputPath = path.join(tempRoot, "output.json");

      try {
        await fs.writeJson(schemaPath, request.schema, { spaces: 2 });

        const result = await runWithSpec(
          runner,
          resolved.spec,
          [
            "exec",
            "--skip-git-repo-check",
            "--sandbox",
            "read-only",
            "--ephemeral",
            "--color",
            "never",
            "-C",
            request.cwd,
            "--output-schema",
            schemaPath,
            "--output-last-message",
            outputPath,
            "-",
          ],
          {
            cwd: request.cwd,
            input: request.prompt,
            timeoutMs: request.timeoutMs ?? 60_000,
          },
        );

        if (result.exitCode !== 0) {
          throw new AppError("Codex could not complete the AI request.", {
            code: "AI_CODEX_FAILED",
            details: `${result.stderr || result.stdout || "codex exited with a non-zero status"}`.trim(),
          });
        }

        const rawText = (await fs.pathExists(outputPath))
          ? (await fs.readFile(outputPath, "utf8")).trim()
          : result.stdout.trim();

        if (!rawText) {
          throw new AppError("Codex returned an empty response.", {
            code: "AI_CODEX_EMPTY",
          });
        }

        return {
          provider: "codex",
          rawText,
        };
      } finally {
        await fs.remove(tempRoot);
      }
    },
  };
}
