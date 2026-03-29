import { asRecord, asString, normalizePaginatedResult } from "./internal.js";
import { N8nApiError } from "./errors.js";
import type {
  ExecuteWorkflowOptions,
  ListWorkflowsOptions,
  N8nExecutionStatus,
  N8nNodeType,
  N8nRequestExecutor,
  N8nWorkflow,
  N8nExecution,
} from "./types.js";

export async function listWorkflows(
  executor: N8nRequestExecutor,
  options: ListWorkflowsOptions = {},
): Promise<ReturnType<typeof normalizePaginatedResult<N8nWorkflow>>> {
  const payload = await executor.request<unknown>({
    method: "GET",
    path: "/workflows",
    query: {
      active: options.active,
      cursor: options.cursor,
      limit: options.limit,
      tags: options.tags?.join(","),
    },
  });

  const normalized = normalizePaginatedResult<Record<string, unknown>>(payload, [
    "data",
    "items",
    "workflows",
  ]);

  return {
    ...normalized,
    data: normalized.data.map(normalizeWorkflow),
  };
}

export async function getWorkflow(
  executor: N8nRequestExecutor,
  workflowId: string,
): Promise<N8nWorkflow> {
  const payload = await executor.request<unknown>({
    method: "GET",
    path: `/workflows/${encodeURIComponent(workflowId)}`,
  });

  return normalizeWorkflow(payload);
}

export async function activateWorkflow(
  executor: N8nRequestExecutor,
  workflowId: string,
): Promise<N8nWorkflow> {
  const payload = await executor.requestWithFallback<unknown>([
    {
      method: "POST",
      path: `/workflows/${encodeURIComponent(workflowId)}/activate`,
      responseType: "auto",
    },
    {
      method: "PATCH",
      path: `/workflows/${encodeURIComponent(workflowId)}`,
      body: { active: true },
    },
  ]);

  return normalizeWorkflow(payload);
}

export async function deactivateWorkflow(
  executor: N8nRequestExecutor,
  workflowId: string,
): Promise<N8nWorkflow> {
  const payload = await executor.requestWithFallback<unknown>([
    {
      method: "POST",
      path: `/workflows/${encodeURIComponent(workflowId)}/deactivate`,
      responseType: "auto",
    },
    {
      method: "PATCH",
      path: `/workflows/${encodeURIComponent(workflowId)}`,
      body: { active: false },
    },
  ]);

  return normalizeWorkflow(payload);
}

export async function executeWorkflow(
  executor: N8nRequestExecutor,
  workflowId: string,
  options: ExecuteWorkflowOptions = {},
): Promise<N8nExecution> {
  const data = options.data ?? {};
  const candidates = [
    {
      method: "POST",
      path: `/workflows/${encodeURIComponent(workflowId)}/execute`,
      body: data,
    },
    {
      method: "POST",
      path: `/workflows/${encodeURIComponent(workflowId)}/run`,
      body: data,
    },
    {
      method: "POST",
      path: `/workflows/${encodeURIComponent(workflowId)}/execute`,
      body: { data },
    },
    {
      method: "POST",
      path: `/workflows/${encodeURIComponent(workflowId)}/run`,
      body: { data },
    },
  ] as const;

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      const payload = await executor.request<unknown>(candidate);
      return normalizeExecution(payload);
    } catch (error) {
      lastError = error;
      if (!shouldRetryExecuteWorkflow(error)) {
        throw error;
      }
    }
  }

  throw lastError;
}

export async function listNodeTypes(
  executor: N8nRequestExecutor,
): Promise<N8nNodeType[]> {
  const payload = await executor.requestWithFallback<unknown>([
    {
      method: "GET",
      path: "/node-types",
    },
    {
      method: "GET",
      path: "/nodes/types",
    },
  ]);

  const normalized = normalizePaginatedResult<Record<string, unknown>>(payload, [
    "data",
    "items",
    "nodeTypes",
  ]);

  const source = normalized.data.length > 0
    ? normalized.data
    : Array.isArray(payload)
      ? (payload as Record<string, unknown>[])
      : [];

  return source.map((entry) => {
    const record = asRecord(entry) ?? {};
    const group = Array.isArray(record.group)
      ? record.group.flatMap((value) => (typeof value === "string" ? [value] : []))
      : [];

    return {
      name: asString(record.name) ?? "",
      displayName: asString(record.displayName) ?? "",
      description: asString(record.description) ?? "",
      group,
      version: typeof record.version === "number" ? record.version : 1,
      defaults: asRecord(record.defaults) ?? {},
      raw: record,
    };
  });
}

function normalizeWorkflow(payload: unknown): N8nWorkflow {
  const record = asRecord(payload) ?? {};
  const tagEntries = Array.isArray(record.tags) ? record.tags : [];
  const tags = tagEntries.flatMap((entry) => {
    if (typeof entry === "string") {
      return [entry];
    }

    const tagRecord = asRecord(entry);
    const name = tagRecord ? asString(tagRecord.name) : undefined;
    return name ? [name] : [];
  });

  return {
    id: asString(record.id) ?? "",
    name: asString(record.name) ?? "",
    active: Boolean(record.active),
    tags,
    nodes: Array.isArray(record.nodes)
      ? record.nodes.map(normalizeWorkflowNode)
      : [],
    connections: asRecord(record.connections) ?? {},
    settings: asRecord(record.settings) ?? {},
    createdAt: asString(record.createdAt),
    updatedAt: asString(record.updatedAt),
    raw: record,
  };
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

function shouldRetryExecuteWorkflow(error: unknown): boolean {
  return error instanceof N8nApiError
    && [400, 404, 405, 422].includes(error.status ?? -1);
}

function normalizeWorkflowNode(entry: unknown): N8nWorkflow["nodes"][number] {
  const record = asRecord(entry) ?? {};
  return {
    id: asString(record.id),
    name: asString(record.name) ?? "node",
    type: asString(record.type) ?? "n8n-nodes-base.unknown",
    parameters: asRecord(record.parameters) ?? {},
    position: Array.isArray(record.position)
      && typeof record.position[0] === "number"
      && typeof record.position[1] === "number"
      ? [record.position[0], record.position[1]]
      : undefined,
    credentials: asRecord(record.credentials),
    disabled: typeof record.disabled === "boolean" ? record.disabled : undefined,
  };
}
