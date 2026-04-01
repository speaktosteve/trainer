export class McpInputError extends Error {
  readonly code = "INVALID_INPUT";

  constructor(message: string) {
    super(message);
    this.name = "McpInputError";
  }
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseIsoDate(value: unknown, fieldName: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !ISO_DATE_RE.test(value)) {
    throw new McpInputError(`${fieldName} must be an ISO date string (YYYY-MM-DD)`);
  }
  return value;
}

export function parseLimit(value: unknown, fallback = 100): number {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new McpInputError("limit must be an integer");
  }
  if (value < 1 || value > 500) {
    throw new McpInputError("limit must be between 1 and 500");
  }
  return value;
}

export function ensureObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new McpInputError("arguments must be an object");
  }
  return input as Record<string, unknown>;
}
