import chalk from "chalk";
import ora, { type Ora } from "ora";

import { APP_NAME, APP_TAGLINE } from "../config.js";
import type { ExecutionOptions, PlannedRun, StepLogger } from "../types.js";

const brand = chalk.hex("#ff6a3d");
const accent = chalk.hex("#26a0da");
const cream = chalk.hex("#f5ead7");
const mint = chalk.hex("#73d2a7");
const dimAccent = chalk.hex("#7aa8bf");

const MASCOT_LINES = [
  "        .-========-.",
  "      .'  .-\"\"\"\"-.  '.",
  "     /   /  .--.  \\   \\",
  "    |   |  (o  o)  |   |",
  "    |   |    __    |   |",
  "    |   |  .'__'.  |   |",
  "     \\   \\  \\__/  /   /",
  "      '._ '------' _.'",
  "         /  /  \\  \\",
  "        /__/    \\__\\",
];

export function renderHeader(options: { compact?: boolean } = {}): void {
  if (options.compact || !process.stdout.isTTY) {
    console.log(`${brand.bold(APP_NAME)} ${chalk.dim(APP_TAGLINE)}`);
    console.log("");
    return;
  }

  console.log("");
  for (let index = 0; index < MASCOT_LINES.length; index += 1) {
    const line = MASCOT_LINES[index] ?? "";
    const painted =
      index < 3 ? accent(line) : index < 7 ? cream(line) : mint(line);
    console.log(`  ${painted}`);
  }

  console.log(`  ${brand.bold(APP_NAME)} ${chalk.whiteBright("creator sidekick")}`);
  console.log(`  ${dimAccent("clip it. crop it. caption it. ship it.")}`);
  console.log("");
}

export function printInteractiveGuide(): void {
  console.log(accent.bold("Quick guide"));
  console.log(`  times     use ${chalk.white("8:43")} or ${chalk.white("00:08:43")}`);
  console.log(`  reel      best for Shorts, Reels, and TikTok-style exports`);
  console.log(`  captions  presets are ready-made, ${chalk.white("Custom / advanced")} is optional`);
  console.log(`  cancel    press ${chalk.white("Ctrl+C")} anytime`);
  console.log("");
}

export async function runStep<T>(
  label: string,
  debug: boolean,
  task: (logger: StepLogger) => Promise<T>,
): Promise<T> {
  const spinner = ora({
    text: label,
    color: "cyan",
  }).start();

  const logger: StepLogger = {
    setText(text: string) {
      spinner.text = text;
    },
    debug(message: string) {
      if (debug) {
        spinner.stop();
        console.log(chalk.dim(message));
        spinner.start();
      }
    },
  };

  try {
    const result = await task(logger);
    spinner.succeed(label);
    return result;
  } catch (error) {
    spinner.fail(label);
    throw error;
  }
}

export function printSummary(options: ExecutionOptions, plan: PlannedRun): void {
  const lines = [
    `${accent.bold("Plan")}`,
    `  source   ${plan.sourceTitle}`,
    `  clip     ${options.range.startTimestamp} -> ${options.range.endTimestamp}`,
    `  mode     ${options.mode === "reel" ? "Reel 1080x1920" : "Original aspect"}`,
    `  captions ${
      options.subtitles === "burn" && options.subtitlePlacement
        ? `Burn in (${options.subtitlePlacement.label})`
        : "Skip"
    }`,
    `  output   ${plan.outputPath}`,
  ];

  console.log(lines.join("\n"));
  console.log("");
}

export function printDryRun(plan: PlannedRun): void {
  console.log(accent.bold("Dry run"));
  console.log(`  ffmpeg   ${plan.tools.ffmpeg.path} (${plan.tools.ffmpeg.source})`);
  console.log(`  ffprobe  ${plan.tools.ffprobe.path} (${plan.tools.ffprobe.source})`);
  console.log(`  yt-dlp   ${plan.tools.ytDlp.path} (${plan.tools.ytDlp.source})`);
  console.log(`  output   ${plan.outputPath}`);
  console.log(`  job dir  ${plan.jobRoot}`);
  console.log("  stages");
  for (const stage of plan.stages) {
    console.log(`    - ${stage}`);
  }
}

export function printDone(outputPath: string, options: { tempPath?: string }): void {
  console.log("");
  console.log(chalk.greenBright("Done"));
  console.log(`Final file: ${outputPath}`);
  if (options.tempPath) {
    console.log(`Temp files kept at: ${options.tempPath}`);
  }
}

export function printWarning(message: string): void {
  console.log(chalk.yellow(`Warning: ${message}`));
}

export function printNote(message: string): void {
  console.log(chalk.dim(message));
}
