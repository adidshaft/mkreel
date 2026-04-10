import which from "which";

import { AppError } from "../errors.js";
import type { AiProvider } from "./provider.js";
import type { AiProviderStatus, CommandRunner, StructuredPromptRequest, StructuredPromptResult } from "./provider.js";

interface ClaudeAuthStatus {
  loggedIn?: boolean;
  authMethod?: string;
}

export function parseClaudeAuthStatus(rawText: string): ClaudeAuthStatus | undefined {
  const trimmed = rawText.trim();
  if (!trimmed.startsWith("{")) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed) as ClaudeAuthStatus;
  } catch {
    return undefined;
  }
}

async function resolveClaudePath(): Promise<string | undefined> {
  try {
    return await which("claude");
  } catch {
    return undefined;
  }
}

export function createClaudeProvider(runner: CommandRunner): AiProvider {
  return {
    name: "claude",
    async detect(): Promise<AiProviderStatus> {
      const executablePath = await resolveClaudePath();
      if (!executablePath) {
        return {
          name: "claude",
          available: false,
          reason: "claude is not installed",
        };
      }

      const helpResult = await runner.run(executablePath, ["--help"], {
        cwd: process.cwd(),
        timeoutMs: 5_000,
      });

      if (helpResult.exitCode !== 0 || !helpResult.stdout.includes("--json-schema")) {
        return {
          name: "claude",
          available: false,
          reason: `${helpResult.stderr || helpResult.stdout || "claude did not expose the required print/json options"}`.trim(),
        };
      }

      const authResult = await runner.run(executablePath, ["auth", "status"], {
        cwd: process.cwd(),
        timeoutMs: 5_000,
      });

      const authStatus = parseClaudeAuthStatus(authResult.stdout);
      if (authStatus?.loggedIn) {
        return {
          name: "claude",
          available: true,
        };
      }

      return {
        name: "claude",
        available: false,
        reason: "claude is installed but not signed in",
      };
    },
    async runStructuredPrompt(request: StructuredPromptRequest): Promise<StructuredPromptResult> {
      const executablePath = await resolveClaudePath();
      if (!executablePath) {
        throw new AppError("Claude is not installed.", {
          code: "AI_CLAUDE_UNAVAILABLE",
        });
      }

      const result = await runner.run(
        executablePath,
        [
          "-p",
          "--output-format",
          "text",
          "--json-schema",
          JSON.stringify(request.schema),
          "--tools",
          "",
          "--permission-mode",
          "dontAsk",
          "--no-session-persistence",
          request.prompt,
        ],
        {
          cwd: request.cwd,
          timeoutMs: request.timeoutMs ?? 60_000,
        },
      );

      if (result.exitCode !== 0) {
        throw new AppError("Claude could not complete the AI request.", {
          code: "AI_CLAUDE_FAILED",
          details: `${result.stderr || result.stdout || "claude exited with a non-zero status"}`.trim(),
        });
      }

      const rawText = result.stdout.trim();
      if (!rawText) {
        throw new AppError("Claude returned an empty response.", {
          code: "AI_CLAUDE_EMPTY",
        });
      }

      return {
        provider: "claude",
        rawText,
      };
    },
  };
}
