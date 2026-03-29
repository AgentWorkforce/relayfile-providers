export type JsonPrimitive = boolean | number | null | string;
export type JsonValue = JsonArray | JsonObject | JsonPrimitive;
export type JsonArray = JsonValue[];
export type JsonObject = { [key: string]: JsonValue | undefined };

export interface N8nConfig {
  baseUrl: string;
  apiKey?: string;
  username?: string;
  password?: string;
  fetch?: typeof fetch;
  apiBasePath?: string;
}

export type N8nCredentialData = Record<string, unknown>;
export type N8nCredentialTokenValue = string | N8nCredentialData;

export interface N8nCredential {
  id: string;
  name: string;
  type: string;
  data?: N8nCredentialData;
  sharedWithProjects?: Array<{ id?: string; name?: string }>;
  createdAt?: string;
  updatedAt?: string;
  raw: Record<string, unknown>;
}

export interface N8nCredentialSchemaProperty {
  name: string;
  type?: string;
  displayName?: string;
  required?: boolean;
  default?: unknown;
  description?: string;
}

export interface N8nCredentialSchema {
  type: string;
  displayName?: string;
  documentationUrl?: string;
  properties: N8nCredentialSchemaProperty[];
  raw: Record<string, unknown>;
}

export interface CreateCredentialInput {
  name: string;
  type: string;
  data: N8nCredentialData;
  nodesAccess?: string[];
}

export interface UpdateCredentialInput {
  name?: string;
  data?: N8nCredentialData;
  nodesAccess?: string[];
}

export interface N8nWorkflowNode {
  id?: string;
  name: string;
  type: string;
  parameters?: Record<string, unknown>;
  position?: [number, number];
  credentials?: Record<string, unknown>;
  disabled?: boolean;
}

export interface N8nWorkflow {
  id: string;
  name: string;
  active: boolean;
  tags: string[];
  nodes: N8nWorkflowNode[];
  connections: Record<string, unknown>;
  settings?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  raw: Record<string, unknown>;
}

export type N8nExecutionStatus =
  | "canceled"
  | "crashed"
  | "error"
  | "new"
  | "running"
  | "success"
  | "waiting"
  | "unknown";

export interface N8nExecution {
  id: string;
  workflowId?: string;
  status: N8nExecutionStatus;
  mode?: string;
  startedAt?: string;
  stoppedAt?: string;
  finished?: boolean;
  retryOf?: string;
  raw: Record<string, unknown>;
}

export interface N8nNodeType {
  name: string;
  displayName?: string;
  description?: string;
  group: string[];
  version?: number;
  defaults?: Record<string, unknown>;
  raw: Record<string, unknown>;
}

export interface N8nPaginatedResult<T> {
  data: T[];
  nextCursor?: string;
  raw: unknown;
}

export interface ListCredentialsOptions {
  type?: string;
  cursor?: string;
  limit?: number;
  includeData?: boolean;
}

export interface ListWorkflowsOptions {
  active?: boolean;
  tags?: string[];
  cursor?: string;
  limit?: number;
}

export interface ExecuteWorkflowOptions {
  data?: Record<string, unknown>;
}

export interface ListExecutionsOptions {
  workflowId?: string;
  status?: N8nExecutionStatus;
  cursor?: string;
  limit?: number;
}

export interface N8nWebhookInput {
  webhookPath?: string;
  path?: string;
  url?: string;
  rawUrl?: string;
  method?: string;
  headers?: Record<string, unknown>;
  query?: Record<string, unknown>;
  params?: Record<string, unknown>;
  body?: unknown;
}

export interface N8nApiRequestOptions {
  method: string;
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
  responseType?: "auto" | "json" | "text" | "void";
}

export interface N8nRequestExecutor {
  request<T>(options: N8nApiRequestOptions): Promise<T>;
  requestWithFallback<T>(
    candidates: readonly N8nApiRequestOptions[],
  ): Promise<T>;
}

export type ProxyMethod = "DELETE" | "GET" | "PATCH" | "POST" | "PUT";

export interface ProxyRequest {
  method: ProxyMethod;
  baseUrl: string;
  endpoint: string;
  connectionId: string;
  headers?: Record<string, string>;
  body?: unknown;
  query?: Record<string, string>;
}

export interface ProxyResponse {
  status: number;
  headers: Record<string, string>;
  data: unknown;
}

export interface NormalizedWebhook {
  provider: string;
  connectionId: string;
  eventType: string;
  objectType: string;
  objectId: string;
  payload: Record<string, unknown>;
  relations?: string[];
  metadata?: Record<string, string>;
}

export interface ConnectionProvider {
  readonly name: string;
  proxy(request: ProxyRequest): Promise<ProxyResponse>;
  healthCheck(connectionId?: string): Promise<boolean>;
  handleWebhook(rawPayload: unknown): Promise<NormalizedWebhook>;
}
