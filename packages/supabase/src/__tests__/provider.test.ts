import test from "node:test";
import assert from "node:assert/strict";
import { SupabaseProvider } from "../provider.js";

function createClient() {
  const calls: Array<Record<string, unknown>> = [];
  return {
    calls,
    ingestWebhook: async (input: Record<string, unknown>) => {
      calls.push(input);
      return {
        status: "queued",
        id: "env_1",
        correlationId: input.correlationId as string | undefined,
      };
    },
  } as any;
}

function createJsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    ...init,
  });
}

test("SupabaseProvider lists users with page and per_page query params", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetchMock = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push([String(input), init]);
    return createJsonResponse({ users: [] }, {
      headers: {
        "content-type": "application/json",
        "x-total-count": "0",
      },
    });
  };
  const provider = new SupabaseProvider(createClient(), {
    supabaseUrl: "https://example.supabase.co",
    serviceRoleKey: "service-role",
    fetch: fetchMock as typeof fetch,
  });

  const result = await provider.listUsers({ page: 2, perPage: 25, filter: "email:github" });

  assert.deepEqual(result, { users: [], total: 0, page: 2, perPage: 25 });
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0]![0],
    "https://example.supabase.co/auth/v1/admin/users?page=2&per_page=25&filter=email%3Agithub",
  );
  assert.deepEqual(calls[0]![1]?.headers, {
    apikey: "service-role",
    Authorization: "Bearer service-role",
  });
});

test("SupabaseProvider extracts provider tokens and injects bearer auth in proxy", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetchMock = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push([url, init]);
    if (url.includes("/admin/users/")) {
      return createJsonResponse({
        id: "user_1",
        app_metadata: {},
        user_metadata: {},
        identities: [
          {
            id: "identity_1",
            provider: "github",
            identity_data: { provider_token: "gho_123" },
          },
        ],
      });
    }

    return createJsonResponse({ ok: true });
  };
  const provider = new SupabaseProvider(createClient(), {
    supabaseUrl: "https://example.supabase.co",
    serviceRoleKey: "service-role",
    fetch: fetchMock as typeof fetch,
  });

  const result = await provider.proxy({
    method: "GET",
    baseUrl: "https://api.github.com",
    endpoint: "/user",
    connectionId: "user_1",
    headers: { "x-supabase-provider": "github" },
  });

  assert.equal(result.status, 200);
  assert.deepEqual(calls[1]![1], {
    method: "GET",
    headers: { Authorization: "Bearer gho_123" },
  });
});

test("SupabaseProvider ingests normalized webhooks through the Relayfile client", async () => {
  const client = createClient();
  const provider = new SupabaseProvider(client, {
    supabaseUrl: "https://example.supabase.co",
    serviceRoleKey: "service-role",
    fetch: (async () => createJsonResponse({})) as typeof fetch,
  });

  const result = await provider.ingestWebhook("ws_1", {
    type: "INSERT",
    schema: "auth",
    table: "users",
    record: { id: "user_1", email: "test@example.com" },
  });

  assert.deepEqual(result, { status: "queued", id: "env_1", correlationId: undefined });
  assert.equal(client.calls.length, 1);
  assert.deepEqual(client.calls[0], {
    workspaceId: "ws_1",
    provider: "supabase",
    event_type: "created",
    path: "/supabase/auth.users/user_1.json",
    data: {
      type: "INSERT",
      schema: "auth",
      table: "users",
      record: { id: "user_1", email: "test@example.com" },
      semantics: {
        properties: {
          provider: "supabase",
          "provider.connection_id": "user_1",
          "provider.event_type": "created",
          "provider.object_id": "user_1",
          "provider.object_type": "auth.users",
        },
        relations: [],
      },
    },
  });
});
