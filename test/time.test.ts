import { describe, expect, it } from "vitest";

import { AppError } from "../src/errors.js";
import {
  formatFilenameTimestamp,
  formatTimestamp,
  parseTimeInput,
  validateTimeRange,
} from "../src/time.js";

describe("time parsing", () => {
  it("parses mm:ss values", () => {
    expect(parseTimeInput("8:43")).toBe(523);
    expect(parseTimeInput("08:43")).toBe(523);
    expect(parseTimeInput("2:55")).toBe(175);
  });

  it("parses hh:mm:ss values", () => {
    expect(parseTimeInput("00:08:43")).toBe(523);
    expect(parseTimeInput("01:02:03")).toBe(3723);
  });

  it("formats timestamps consistently", () => {
    expect(formatTimestamp(523)).toBe("00:08:43");
    expect(formatFilenameTimestamp(523)).toBe("08m43s");
    expect(formatFilenameTimestamp(3723)).toBe("01h02m03s");
  });

  it("rejects invalid values", () => {
    expect(() => parseTimeInput("8:75")).toThrow(AppError);
    expect(() => parseTimeInput("abc")).toThrow(AppError);
  });
});

describe("time ranges", () => {
  it("accepts an end after the start", () => {
    expect(() => validateTimeRange(30, 31)).not.toThrow();
  });

  it("rejects end times that do not come later", () => {
    expect(() => validateTimeRange(30, 30)).toThrow(AppError);
    expect(() => validateTimeRange(31, 30)).toThrow(AppError);
  });
});
