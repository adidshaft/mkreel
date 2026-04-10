import { execa } from "execa";

import { AppError } from "../errors.js";
import type { AiProviderName, AiProviderPreference } from "../types.js";
import { createClaudeProvider } from "./claude.js";
import { createCodexProvider } from "./codex.js";

export interface CommandRunOptions {
  cwd?: string;
  input?: string;
  timeoutMs?: number;
}

export interface CommandRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  failed: boolean;
}

export interface CommandRunner {
  run(command: string, args: string[], options?: CommandRunOptions): Promise<CommandRunResult>;
}

export interface AiProviderStatus {
  name: AiProviderName;
  available: boolean;
  reason?: string;
}

export interface StructuredPromptRequest {
  cwd: string;
  prompt: string;
  schema: object;
  timeoutMs?: number;
}

export interface StructuredPromptResult {
  provider: AiProviderName;
  rawText: string;
}

export interface AiProvider {
  name: AiProviderName;
  detect(): Promise<AiProviderStatus>;
  runStructuredPrompt(request: StructuredPromptRequest): Promise<StructuredPromptResult>;
}

export const execaCommandRunner: CommandRunner = {
  async run(command, args, options = {}) {
    try {
      const result = await execa(command, args, {
        cwd: options.cwd,
        input: options.input,
        reject: false,
        timeout: options.timeoutMs,
      });

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode ?? 0,
        failed: result.failed,
      };
    } catch (error) {
      return {
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
        exitCode: 1,
        failed: true,
      };
    }
  },
};

export function getAiProviders(runner: CommandRunner = execaCommandRunner): AiProvider[] {
  return [createCodexProvider(runner), createClaudeProvider(runner)];
}

export function selectProviderOrder(
  preference: AiProviderPreference,
  statuses: Record<AiProviderName, AiProviderStatus>,
): AiProviderName[] {
  if (preference !== "auto") {
    return [preference];
  }

  return (["codex", "claude"] as const).filter((name) => statuses[name].available);
}

function formatAvailabilityDetails(statuses: Record<AiProviderName, AiProviderStatus>): string {
  return (["codex", "claude"] as const)
    .map((name) => `${name}: ${statuses[name].available ? "available" : statuses[name].reason ?? "unavailable"}`)
    .join(" | ");
}

export async function detectAiProviders(
  runner: CommandRunner = execaCommandRunner,
): Promise<Record<AiProviderName, AiProviderStatus>> {
  const providers = getAiProviders(runner);
  const results = await Promise.all(providers.map(async (provider) => provider.detect()));

  return {
    codex: results.find((result) => result.name === "codex") ?? {
      name: "codex",
      available: false,
      reason: "not checked",
    },
    claude: results.find((result) => result.name === "claude") ?? {
      name: "claude",
      available: false,
      reason: "not checked",
    },
  };
}

export async function runStructuredPromptWithProvider(
  preference: AiProviderPreference,
  request: StructuredPromptRequest,
  runner: CommandRunner = execaCommandRunner,
): Promise<StructuredPromptResult> {
  const providers = getAiProviders(runner);
  const statuses = await detectAiProviders(runner);
  const order = selectProviderOrder(preference, statuses);

  if (order.length === 0) {
    throw new AppError("No supported AI provider is ready right now.", {
      code: "AI_PROVIDER_UNAVAILABLE",
      hint: "Install and sign into codex or claude, or run mkreel without AI features.",
      details: formatAvailabilityDetails(statuses),
    });
  }

  let lastError: unknown;
  for (const providerName of order) {
    const provider = providers.find((candidate) => candidate.name === providerName);
    const status = statuses[providerName];
    if (!provider || !status.available) {
      lastError = new AppError(`${providerName} is not available.`, {
        code: "AI_PROVIDER_UNAVAILABLE",
        details: status.reason,
      });
      continue;
    }

    try {
      return await provider.runStructuredPrompt(request);
    } catch (error) {
      lastError = error;
      if (preference !== "auto") {
        throw error;
      }
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new AppError("No AI provider could complete the request.", {
    code: "AI_PROVIDER_FAILED",
    details: formatAvailabilityDetails(statuses),
  });
}
