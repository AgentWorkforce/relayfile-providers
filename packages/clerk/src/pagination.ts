import type { ClerkPaginatedResponse } from "./types.js";

export function normalizePaginatedResponse<T>(value: unknown): ClerkPaginatedResponse<T> {
  if (!isRecord(value) || !Array.isArray(value.data)) {
    throw new Error("Clerk paginated responses must include a data array.");
  }

  const totalCount = getTotalCount(value);
  return {
    ...value,
    data: value.data as T[],
    totalCount,
    total_count: totalCount,
  };
}

function getTotalCount(value: Record<string, unknown>): number {
  const candidates = [value.totalCount, value.total_count];

  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
  }

  throw new Error("Clerk paginated responses must include totalCount or total_count.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
