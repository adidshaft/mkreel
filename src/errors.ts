export class AppError extends Error {
  readonly code: string;
  readonly hint?: string;
  readonly details?: string;

  constructor(
    message: string,
    options: {
      code?: string;
      hint?: string;
      details?: string;
      cause?: unknown;
    } = {},
  ) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "AppError";
    this.code = options.code ?? "MKREEL_ERROR";
    this.hint = options.hint;
    this.details = options.details;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function asAppError(
  error: unknown,
  fallbackMessage = "Something went wrong while running mkreel.",
): AppError {
  if (isAppError(error)) {
    return error;
  }

  if (error instanceof Error) {
    const isUserCancel =
      error.name === "ExitPromptError" ||
      error.name === "AbortPromptError" ||
      /cancelled|canceled|force closed/i.test(error.message);

    if (isUserCancel) {
      return new AppError("Cancelled.", {
        code: "USER_CANCELLED",
      });
    }

    return new AppError(fallbackMessage, {
      cause: error,
      details: error.message,
    });
  }

  return new AppError(fallbackMessage, {
    details: String(error),
  });
}

export function formatError(error: unknown, debug = false): string {
  const normalized = asAppError(error);
  const lines = [`Error: ${normalized.message}`];

  if (normalized.hint) {
    lines.push(`Hint: ${normalized.hint}`);
  }

  if (normalized.details) {
    lines.push(debug ? `Details: ${normalized.details}` : "Run with --debug for more detail.");
  } else if (debug && normalized.cause instanceof Error) {
    lines.push(`Cause: ${normalized.cause.message}`);
  }

  return lines.join("\n");
}
