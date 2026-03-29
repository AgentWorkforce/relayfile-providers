export type MockNangoHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface MockResponseSpec {
  status?: number;
  headers?: Record<string, string>;
  json?: unknown;
  text?: string;
}

export interface MockNangoCall {
  method: string;
  path: string;
  url: string;
  headers: Record<string, string>;
  searchParams: Record<string, string[]>;
  bodyText?: string;
  jsonBody?: unknown;
}

export interface MockNangoServer {
  readonly baseUrl: string;
  readonly fetch: typeof fetch;
  register(method: MockNangoHttpMethod, path: string, response: MockResponseResolver): void;
  route(method: MockNangoHttpMethod, path: string, response: MockResponseResolver): void;
  json(
    method: MockNangoHttpMethod,
    path: string,
    body: unknown,
    init?: Omit<MockResponseSpec, "json" | "text">,
  ): void;
  error(
    method: MockNangoHttpMethod,
    path: string,
    status: number,
    body: unknown,
    init?: Omit<MockResponseSpec, "status" | "json" | "text">,
  ): void;
  callsFor(method?: MockNangoHttpMethod, path?: string): MockNangoCall[];
  getCalls(method?: MockNangoHttpMethod, path?: string): MockNangoCall[];
  reset(): void;
}

export interface CreateMockNangoServerOptions {
  baseUrl?: string;
}

export type MockResponseFactory = (call: MockNangoCall) => MockResponseSpec | Promise<MockResponseSpec>;
export type MockResponseResolver = MockResponseSpec | MockResponseFactory;

interface CapturedRequest {
  method: string;
  path: string;
  url: URL;
  request: Request;
}

export function createMockNangoServer(
  options: CreateMockNangoServerOptions = {},
): MockNangoServer {
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? "https://api.nango.dev");
  const routes = new Map<string, MockResponseResolver[]>();
  const calls: MockNangoCall[] = [];

  const register = (method: MockNangoHttpMethod, path: string, response: MockResponseResolver): void => {
    const key = toRouteKey(method, path);
    const queue = routes.get(key) ?? [];

    queue.push(response);
    routes.set(key, queue);
  };

  const fetchImpl: typeof fetch = async (input, init) => {
    const captured = createCapturedRequest(input, init, baseUrl);
    const call = await captureCall(captured);
    const key = toRouteKey(captured.method, captured.path);
    const queue = routes.get(key);
    const resolver = queue?.shift();

    calls.push(call);

    if (resolver === undefined) {
      throw new Error(`No mock Nango route registered for ${captured.method} ${captured.path}.`);
    }

    const spec = typeof resolver === "function" ? await resolver(call) : resolver;
    return buildResponse(spec);
  };

  return {
    baseUrl,
    fetch: fetchImpl,
    register,
    route: register,
    json(method, path, body, init = {}) {
      register(method, path, jsonResponse(body, init));
    },
    error(method, path, status, body, init = {}) {
      register(method, path, errorResponse(status, body, init));
    },
    callsFor(method, path) {
      return filterCalls(calls, method, path);
    },
    getCalls(method, path) {
      return filterCalls(calls, method, path);
    },
    reset() {
      routes.clear();
      calls.length = 0;
    },
  };
}

export function jsonResponse(
  body: unknown,
  init: Omit<MockResponseSpec, "json" | "text"> = {},
): MockResponseSpec {
  return {
    ...(init.status === undefined ? {} : { status: init.status }),
    ...(init.headers === undefined ? {} : { headers: init.headers }),
    json: body,
  };
}

export function errorResponse(
  status: number,
  body: unknown,
  init: Omit<MockResponseSpec, "status" | "json" | "text"> = {},
): MockResponseSpec {
  return {
    status,
    ...(init.headers === undefined ? {} : { headers: init.headers }),
    json: body,
  };
}

function filterCalls(
  calls: MockNangoCall[],
  method?: MockNangoHttpMethod,
  path?: string,
): MockNangoCall[] {
  const normalizedMethod = method?.toUpperCase();
  const normalizedPath = path === undefined ? undefined : normalizePath(path);

  return calls.filter((call) => {
    if (normalizedMethod !== undefined && call.method !== normalizedMethod) {
      return false;
    }

    if (normalizedPath !== undefined && call.path !== normalizedPath) {
      return false;
    }

    return true;
  });
}

function toRouteKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${normalizePath(path)}`;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function normalizePath(path: string): string {
  const trimmed = path.trim();
  if (trimmed.length === 0 || trimmed === "/") {
    return "/";
  }

  const prefixed = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return prefixed.replace(/\/+$/, "");
}

function createCapturedRequest(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  baseUrl: string,
): CapturedRequest {
  const request = input instanceof Request ? new Request(input, init) : new Request(resolveUrl(input, baseUrl), init);
  const url = new URL(request.url);

  return {
    request,
    url,
    method: request.method.toUpperCase(),
    path: normalizePath(url.pathname),
  };
}

function resolveUrl(input: RequestInfo | URL, baseUrl: string): string {
  if (input instanceof URL) {
    return input.toString();
  }

  const value = typeof input === "string" ? input : input.toString();
  if (/^https?:\/\//.test(value)) {
    return value;
  }

  return new URL(value, baseUrl).toString();
}

async function captureCall(input: CapturedRequest): Promise<MockNangoCall> {
  const bodyText = await readBodyText(input.request);
  const jsonBody = bodyText === undefined ? undefined : tryParseJson(bodyText);

  return {
    method: input.method,
    path: input.path,
    url: input.url.toString(),
    headers: Object.fromEntries(input.request.headers.entries()),
    searchParams: collectSearchParams(input.url),
    ...(bodyText === undefined ? {} : { bodyText }),
    ...(jsonBody === undefined ? {} : { jsonBody }),
  };
}

async function readBodyText(request: Request): Promise<string | undefined> {
  const bodyText = await request.clone().text();
  return bodyText.length === 0 ? undefined : bodyText;
}

function collectSearchParams(url: URL): Record<string, string[]> {
  const output: Record<string, string[]> = {};

  for (const [name, value] of url.searchParams.entries()) {
    const existing = output[name];
    if (existing === undefined) {
      output[name] = [value];
      continue;
    }

    existing.push(value);
  }

  return output;
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function buildResponse(spec: MockResponseSpec): Response {
  const status = spec.status ?? 200;
  const headers = new Headers(spec.headers);

  if (spec.json !== undefined) {
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    return new Response(JSON.stringify(spec.json), { status, headers });
  }

  if (spec.text !== undefined) {
    return new Response(spec.text, { status, headers });
  }

  return new Response(null, { status, headers });
}
