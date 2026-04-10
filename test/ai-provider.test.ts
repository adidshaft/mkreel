import os from "node:os";
import path from "node:path";

import fs from "fs-extra";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { whichMock } = vi.hoisted(() => ({
  whichMock: vi.fn<(command: string) => Promise<string>>(),
}));

vi.mock("which", () => ({
  default: whichMock,
}));

import { createClaudeProvider, parseClaudeAuthStatus } from "../src/ai/claude.js";
import { runStructuredPromptWithProvider, selectProviderOrder, type CommandRunner } from "../src/ai/provider.js";

function createRunner(
  handler: (command: string, args: string[]) => Promise<{ stdout?: string; stderr?: string; exitCode?: number }>,
): CommandRunner {
  return {
    async run(command, args) {
      const result = await handler(command, args);
      const exitCode = result.exitCode ?? 0;
      return {
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        exitCode,
        failed: exitCode !== 0,
      };
    },
  };
}

describe("AI providers", () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mkreel-ai-test-"));
    whichMock.mockReset();
  });

  afterEach(async () => {
    await fs.remove(tempRoot);
  });

  it("parses Claude auth status JSON", () => {
    expect(parseClaudeAuthStatus('{"loggedIn":true,"authMethod":"oauth"}')).toMatchObject({
      loggedIn: true,
      authMethod: "oauth",
    });
  });

  it("detects Claude when the CLI is installed but not signed in", async () => {
    whichMock.mockImplementation(async (command: string) => {
      if (command === "claude") {
        return "/usr/local/bin/claude";
      }
      throw new Error("not found");
    });

    const runner = createRunner(async (_command, args) => {
      if (args[0] === "--help") {
        return { stdout: "Usage...\n--json-schema", exitCode: 0 };
      }

      if (args[0] === "auth" && args[1] === "status") {
        return {
          stdout: '{"loggedIn":false,"authMethod":"none"}',
          exitCode: 1,
        };
      }

      return { exitCode: 1, stderr: "unexpected" };
    });

    const provider = createClaudeProvider(runner);
    const detection = await provider.detect();
    expect(detection).toMatchObject({
      name: "claude",
      available: false,
      reason: "claude is installed but not signed in",
    });
  });

  it("prefers available providers in auto mode", () => {
    expect(
      selectProviderOrder("auto", {
        codex: { name: "codex", available: true },
        claude: { name: "claude", available: false, reason: "signed out" },
      }),
    ).toEqual(["codex"]);
  });

  it("falls back from Codex to Claude when auto mode hits a provider failure", async () => {
    const wrapperPath = path.join(tempRoot, "pkg", "bin", "codex.js");
    const vendoredBinary = path.join(
      tempRoot,
      "pkg",
      "node_modules",
      "@openai",
      "codex-darwin-arm64",
      "vendor",
      "aarch64-apple-darwin",
      "codex",
      "codex",
    );

    await fs.ensureFile(wrapperPath);
    await fs.ensureFile(vendoredBinary);

    whichMock.mockImplementation(async (command: string) => {
      if (command === "codex") {
        return wrapperPath;
      }
      if (command === "claude") {
        return "/usr/local/bin/claude";
      }
      throw new Error("not found");
    });

    const runner = createRunner(async (command, args) => {
      if (command === wrapperPath && args[0] === "exec" && args[1] === "--help") {
        return { exitCode: 1, stderr: "Missing optional dependency @openai/codex-darwin-x64" };
      }

      if (command === "arch" && args.includes(vendoredBinary) && args.includes("--help")) {
        return { exitCode: 0, stdout: "Usage...\n--output-schema" };
      }

      if (command === "arch" && args.includes(vendoredBinary) && args.includes("status")) {
        return { exitCode: 0, stdout: "Logged in using ChatGPT" };
      }

      if (command === "arch" && args.includes(vendoredBinary) && args.includes("--output-last-message")) {
        return { exitCode: 1, stderr: "Codex execution failed" };
      }

      if (command === "/usr/local/bin/claude" && args[0] === "--help") {
        return { exitCode: 0, stdout: "Usage...\n--json-schema" };
      }

      if (command === "/usr/local/bin/claude" && args[0] === "auth" && args[1] === "status") {
        return { exitCode: 0, stdout: '{"loggedIn":true,"authMethod":"oauth"}' };
      }

      if (command === "/usr/local/bin/claude" && args[0] === "-p") {
        return { exitCode: 0, stdout: '{"ok":true}' };
      }

      return { exitCode: 1, stderr: `unexpected ${command} ${args.join(" ")}` };
    });

    const result = await runStructuredPromptWithProvider(
      "auto",
      {
        cwd: tempRoot,
        prompt: "return json",
        schema: { type: "object" },
        timeoutMs: 500,
      },
      runner,
    );

    expect(result).toMatchObject({
      provider: "claude",
      rawText: '{"ok":true}',
    });
  });
});
