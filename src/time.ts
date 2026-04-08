import { AppError } from "./errors.js";

export function parseTimeInput(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new AppError("Time value cannot be empty.", {
      code: "TIME_EMPTY",
      hint: "Use a value like 8:43 or 00:08:43.",
    });
  }

  const parts = trimmed.split(":");
  if (parts.length !== 2 && parts.length !== 3) {
    throw new AppError(`Invalid time "${value}".`, {
      code: "TIME_INVALID",
      hint: "Use mm:ss or hh:mm:ss.",
    });
  }

  const numbers = parts.map((part) => Number.parseInt(part, 10));
  if (numbers.some((part) => Number.isNaN(part) || part < 0)) {
    throw new AppError(`Invalid time "${value}".`, {
      code: "TIME_INVALID",
      hint: "Only whole, non-negative numbers are supported.",
    });
  }

  if (parts.length === 2) {
    const minutes = numbers[0]!;
    const seconds = numbers[1]!;
    if (seconds >= 60) {
      throw new AppError(`Invalid time "${value}".`, {
        code: "TIME_INVALID",
        hint: "Seconds must be less than 60.",
      });
    }
    return minutes * 60 + seconds;
  }

  const hours = numbers[0]!;
  const minutes = numbers[1]!;
  const seconds = numbers[2]!;
  if (minutes >= 60 || seconds >= 60) {
    throw new AppError(`Invalid time "${value}".`, {
      code: "TIME_INVALID",
      hint: "Minutes and seconds must both be less than 60.",
    });
  }

  return hours * 3600 + minutes * 60 + seconds;
}

export function formatTimestamp(totalSeconds: number): string {
  const normalized = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(normalized / 3600);
  const minutes = Math.floor((normalized % 3600) / 60);
  const seconds = normalized % 60;
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

export function formatFilenameTimestamp(totalSeconds: number): string {
  const normalized = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(normalized / 3600);
  const minutes = Math.floor((normalized % 3600) / 60);
  const seconds = normalized % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}h${String(minutes).padStart(2, "0")}m${String(seconds).padStart(2, "0")}s`;
  }

  return `${String(minutes).padStart(2, "0")}m${String(seconds).padStart(2, "0")}s`;
}

export function validateTimeRange(startSeconds: number, endSeconds: number): void {
  if (endSeconds <= startSeconds) {
    throw new AppError("End time must be later than start time.", {
      code: "TIME_RANGE_INVALID",
      hint: "Pick an end time after the clip start.",
    });
  }
}
