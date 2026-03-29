import { asRecord, asString, normalizePaginatedResult } from "./internal.js";
import type {
  ListExecutionsOptions,
  N8nExecution,
  N8nExecutionStatus,
  N8nRequestExecutor,
} from "./types.js";

export async function listExecutions(
  executor: N8nRequestExecutor,
  options: ListExecutionsOptions = {},
): Promise<ReturnType<typeof normalizePaginatedResult<N8nExecution>>> {
  const payload = await executor.request<unknown>({
    method: "GET",
    path: "/executions",
    query: {
      cursor: options.cursor,
      limit: options.limit,
      status: options.status,
      workflowId: options.workflowId,
    },
  });

  const normalized = normalizePaginatedResult<Record<string, unknown>>(payload, [
    "data",
    "items",
    "executions",
  ]);

  return {
    ...normalized,
    data: normalized.data.map(normalizeExecution),
  };
}

export async function getExecution(
  executor: N8nRequestExecutor,
  executionId: string,
): Promise<N8nExecution> {
  const payload = await executor.request<unknown>({
    method: "GET",
    path: `/executions/${encodeURIComponent(executionId)}`,
  });

  return normalizeExecution(payload);
}

export async function deleteExecution(
  executor: N8nRequestExecutor,
  executionId: string,
): Promise<void> {
  await executor.request<void>({
    method: "DELETE",
    path: `/executions/${encodeURIComponent(executionId)}`,
    responseType: "void",
  });
}

function normalizeExecution(payload: unknown): N8nExecution {
  const record = asRecord(payload) ?? {};
  const status = (asString(record.status) ?? "unknown") as N8nExecutionStatus;

  return {
    id: asString(record.id) ?? "",
    workflowId:
      asString(record.workflowId) ??
      asString(record.workflow_id) ??
      asString(asRecord(record.workflowData)?.id),
    status: status as N8nExecution["status"],
    mode: asString(record.mode),
    startedAt: asString(record.startedAt) ?? asString(record.started_at),
    stoppedAt: asString(record.stoppedAt) ?? asString(record.stopped_at),
    finished:
      typeof record.finished === "boolean" ? record.finished : undefined,
    retryOf: asString(record.retryOf) ?? asString(record.retry_of),
    raw: record,
  };
}
