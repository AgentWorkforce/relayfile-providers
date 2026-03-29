import assert from "node:assert/strict";
import test from "node:test";

import {
  N8nApiError,
  N8nConfigurationError,
  N8nCredentialTokenError,
  N8nProvider,
  buildN8nAuthHeaders,
  createN8nProvider,
  requestWithFallback,
  resolveConfig,
} from "../index.js";

function createClient() {
  return {
    ingestWebhook: async (input: unknown) =>
      ({ status: "queued", queued: true, input }) as unknown,
  } as Parameters<typeof createN8nProvider>[0];
}

function createJsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

test("constructor normalizes config and validates auth requirements", () => {
  const client = createClient();
  const provider = createN8nProvider(client, {
    baseUrl: " https://n8n.example.com/ ",
    apiKey: " secret ",
  });

  assert.ok(provider instanceof N8nProvider);
  assert.equal(provider.name, "n8n");
  assert.equal(provider.baseUrl, "https://n8n.example.com");
  assert.equal(resolveConfig({ baseUrl: "http://localhost:5678", apiKey: "x" }).apiBasePath, "/api/v1");
  assert.throws(
    () => createN8nProvider(client, { baseUrl: "https://n8n.example.com" }),
    N8nConfigurationError,
  );
});

test("auth headers support API key and basic auth", () => {
  const apiKeyHeaders = buildN8nAuthHeaders(
    resolveConfig({ baseUrl: "https://n8n.example.com", apiKey: "secret" }),
  );
  const basicHeaders = buildN8nAuthHeaders(
    resolveConfig({
      baseUrl: "https://n8n.example.com",
      username: "relay",
      password: "file",
    }),
  );

  assert.equal(apiKeyHeaders["X-N8N-API-KEY"], "secret");
  assert.match(basicHeaders.Authorization ?? "", /^Basic /);
});

test("requestWithFallback retries 404 endpoints and returns the successful candidate", async () => {
  const calls: string[] = [];
  const config = resolveConfig({
    baseUrl: "https://n8n.example.com",
    apiKey: "secret",
    fetch: async (input) => {
      calls.push(String(input));
      if (calls.length === 1) {
        return createJsonResponse({ message: "missing" }, { status: 404 });
      }
      return createJsonResponse({ ok: true });
    },
  });

  const payload = await requestWithFallback<{ ok: boolean }>(config, [
    { method: "GET", path: "/first" },
    { method: "GET", path: "/second" },
  ]);

  assert.deepEqual(payload, { ok: true });
  assert.equal(calls.length, 2);
  assert.match(calls[0] ?? "", /\/api\/v1\/first$/);
  assert.match(calls[1] ?? "", /\/api\/v1\/second$/);
});

test("getAccessToken returns strings for known credential types and raw data for generic credentials", async () => {
  const fetch = async (input: string | URL | Request) => {
    if (String(input).includes("/credentials/oauth")) {
      return createJsonResponse({
        id: "oauth",
        name: "OAuth",
        type: "oAuth2Api",
        data: { access_token: "oauth-token" },
      });
    }

    return createJsonResponse({
      id: "generic",
      name: "Generic",
      type: "customApi",
      data: { apiKey: "secret-key", headerName: "X-API-Key" },
    });
  };

  const provider = createN8nProvider(createClient(), {
    baseUrl: "https://n8n.example.com",
    apiKey: "secret",
    fetch,
  });

  const oauth = await provider.getAccessToken("oauth");
  const generic = await provider.getAccessToken("generic");

  assert.equal(oauth, "oauth-token");
  assert.deepEqual(generic, { apiKey: "secret-key", headerName: "X-API-Key" });
});

test("proxy injects credential-derived auth headers and parses JSON responses", async () => {
  const observed: Array<{ input: string; init?: RequestInit }> = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    observed.push({ input: String(input), init });

    if (String(input).includes("/api/v1/credentials/cred-1")) {
      return createJsonResponse({
        id: "cred-1",
        name: "GitHub",
        type: "githubApi",
        data: { token: "gh-token" },
      });
    }

    return createJsonResponse({ login: "khaliq" });
  };

  const provider = createN8nProvider(createClient(), {
    baseUrl: "https://n8n.example.com",
    apiKey: "secret",
    fetch,
  });

  const response = await provider.proxy({
    method: "GET",
    baseUrl: "https://api.github.com",
    endpoint: "/user",
    connectionId: "cred-1",
    headers: { "x-extra": "1" },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.data, { login: "khaliq" });
  assert.equal(observed.length, 2);
  assert.match(String(observed[1]!.input), /^https:\/\/api\.github\.com\/user$/);
  const headers = (observed[1]?.init?.headers ?? {}) as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer gh-token");
  assert.equal(headers["x-extra"], "1");
});

test("proxy throws when a credential cannot be converted into auth headers", async () => {
  const provider = createN8nProvider(createClient(), {
    baseUrl: "https://n8n.example.com",
    apiKey: "secret",
    fetch: async () =>
      createJsonResponse({
        id: "cred-2",
        name: "Broken",
        type: "customApi",
        data: { unsupported: true },
      }),
  });

  await assert.rejects(
    () =>
      provider.proxy({
        method: "GET",
        baseUrl: "https://api.example.com",
        endpoint: "/me",
        connectionId: "cred-2",
      }),
    N8nCredentialTokenError,
  );
});

test("non-404 fallback failures are surfaced immediately", async () => {
  const config = resolveConfig({
    baseUrl: "https://n8n.example.com",
    apiKey: "secret",
    fetch: async () => createJsonResponse({ error: "bad" }, { status: 500 }),
  });

  await assert.rejects(
    () =>
      requestWithFallback(config, [
        { method: "GET", path: "/first" },
        { method: "GET", path: "/second" },
      ]),
    N8nApiError,
  );
});
