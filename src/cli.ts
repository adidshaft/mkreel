#!/usr/bin/env node

import { Command, InvalidArgumentError, Option } from "commander";

import { formatError } from "./errors.js";
import { runMkreel, runPackageCommand, runSuggestCommand } from "./index.js";

function parseOptionalInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    throw new InvalidArgumentError("Expected a whole number.");
  }
  return parsed;
}

const program = new Command();

function createAiProviderOption(): Option {
  return new Option("--ai <provider>", "AI provider: auto, codex, or claude")
    .choices(["auto", "codex", "claude"])
    .default("auto");
}

program
  .name("mkreel")
  .description("Clip YouTube moments into polished reels with optional burned subtitles.")
  .argument("<url>", "YouTube video URL")
  .option("--smart", "Ask AI for a suggested clip, mode, and caption preset before the regular flow")
  .option("--start <time>", "Clip start time, e.g. 8:43")
  .option("--end <time>", "Clip end time, e.g. 11:38")
  .option("--mode <mode>", "Output mode: reel or original")
  .option("--subs <mode>", "Subtitle mode: burn or skip")
  .option("--subtitle-position <position>", "Caption placement: bottom, lower-third, center, top, or custom")
  .option("--subtitle-size <size>", "Caption size: compact, balanced, large, xl, or custom")
  .option("--subtitle-style <style>", "Caption style: creator, clean, soft, or custom")
  .option("--output <file>", "Output file path")
  .option("--dry-run", "Print the resolved plan without running the pipeline")
  .option("--keep-temp", "Keep the job workspace after completion")
  .option("--open", "Open the final file after export")
  .option("--debug", "Show deeper failure detail and preserve temp files on errors")
  .option("--non-interactive", "Disable prompts and require all key flags")
  .addOption(createAiProviderOption())
  .addOption(
    new Option("--subtitle-alignment <value>", "ASS alignment for custom subtitle placement")
      .argParser(parseOptionalInteger)
      .hideHelp(),
  )
  .addOption(
    new Option("--subtitle-margin-v <value>", "Subtitle vertical margin")
      .argParser(parseOptionalInteger)
      .hideHelp(),
  )
  .addOption(
    new Option("--subtitle-margin-l <value>", "Subtitle left margin")
      .argParser(parseOptionalInteger)
      .hideHelp(),
  )
  .addOption(
    new Option("--subtitle-margin-r <value>", "Subtitle right margin")
      .argParser(parseOptionalInteger)
      .hideHelp(),
  )
  .addOption(
    new Option("--subtitle-font-size <value>", "Subtitle font size")
      .argParser(parseOptionalInteger)
      .hideHelp(),
  )
  .addOption(
    new Option("--subtitle-outline <value>", "Subtitle outline thickness")
      .argParser(parseOptionalInteger)
      .hideHelp(),
  )
  .addOption(
    new Option("--subtitle-shadow <value>", "Subtitle shadow strength")
      .argParser(parseOptionalInteger)
      .hideHelp(),
  )
  .addOption(new Option("--subtitle-bold", "Use bold captions").hideHelp())
  .showHelpAfterError()
  .addHelpText(
    "after",
    `
Examples:
  mkreel https://www.youtube.com/watch?v=abc123
  mkreel https://www.youtube.com/watch?v=abc123 --smart
  mkreel "https://youtu.be/abc123" --start 8:43 --end 11:38 --mode reel --subs burn
  mkreel suggest "<url>" --ai auto
  mkreel package clip.mp4 --ai codex
  mkreel "<url>" --start 00:08:43 --end 00:11:38 --mode original --subs skip --dry-run

Advanced caption tuning flags still exist for power users and are documented in the README.
`,
  )
  .action(async (url, options) => {
    try {
      await runMkreel({
        url,
        ...options,
        cwd: process.cwd(),
      });
    } catch (error) {
      console.error(formatError(error, Boolean(options.debug)));
      process.exitCode = 1;
    }
  });

program
  .command("suggest")
  .description("Suggest three strong clip ideas from a YouTube video transcript.")
  .argument("<url>", "YouTube video URL")
  .addOption(createAiProviderOption())
  .option("--json", "Print structured JSON only")
  .option("--debug", "Show deeper failure detail")
  .action(async (url, options) => {
    try {
      await runSuggestCommand({
        url,
        ...options,
        cwd: process.cwd(),
      });
    } catch (error) {
      console.error(formatError(error, Boolean(options.debug)));
      process.exitCode = 1;
    }
  });

program
  .command("package")
  .description("Generate creator-friendly publishing assets for a local clip.")
  .argument("<file>", "Local clip path, for example clip.mp4")
  .addOption(createAiProviderOption())
  .option("--context <text>", "Extra text context for titles, captions, and hooks")
  .option("--json", "Print structured JSON only")
  .option("--debug", "Show deeper failure detail")
  .action(async (inputPath, options) => {
    try {
      await runPackageCommand({
        inputPath,
        ...options,
        cwd: process.cwd(),
      });
    } catch (error) {
      console.error(formatError(error, Boolean(options.debug)));
      process.exitCode = 1;
    }
  });

await program.parseAsync(process.argv);
