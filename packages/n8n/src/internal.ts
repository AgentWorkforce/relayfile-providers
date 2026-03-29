import type { N8nPaginatedResult } from "./types.js";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

export function asStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") {
      result[key] = entry;
    } else if (typeof entry === "number" || typeof entry === "boolean") {
      result[key] = String(entry);
    }
  }

  return result;
}

export function toPayloadRecord(value: unknown): Record<string, unknown> {
  if (isRecord(value)) {
    return value;
  }

  return value === undefined ? {} : { value };
}

export function getNestedValue(
  record: Record<string, unknown>,
  path: string,
): unknown {
  const segments = path.split(".");
  let current: unknown = record;

  for (const segment of segments) {
    const currentRecord = asRecord(current);
    if (!currentRecord || !(segment in currentRecord)) {
      return undefined;
    }
    current = currentRecord[segment];
  }

  return current;
}

export function getNestedString(
  record: Record<string, unknown>,
  path: string,
): string | undefined {
  return asString(getNestedValue(record, path));
}

export function normalizePaginatedResult<T>(
  payload: unknown,
  arrayKeys: readonly string[] = ["data", "items"],
): N8nPaginatedResult<T> {
  if (Array.isArray(payload)) {
    return { data: payload as T[], raw: payload };
  }

  const record = asRecord(payload);
  if (!record) {
    return { data: [], raw: payload };
  }

  for (const key of arrayKeys) {
    const candidate = record[key];
    if (Array.isArray(candidate)) {
      return {
        data: candidate as T[],
        nextCursor:
          asString(record.nextCursor) ??
          asString(record.next_cursor) ??
          asString(record.cursor),
        raw: payload,
      };
    }
  }

  return {
    data: [],
    nextCursor:
      asString(record.nextCursor) ??
      asString(record.next_cursor) ??
      asString(record.cursor),
    raw: payload,
  };
}
