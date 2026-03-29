import assert from "node:assert/strict";
import { test } from "node:test";
import { ComposioProvider } from "../composio-provider";
import * as barrel from "../index";
import type { ProxyRequest } from "@relayfile/sdk";

interface FetchCall {
  input: string;
  init?: RequestInit;
}

type HeaderSource = Exclude<RequestInit["headers"], undefined>;

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}

function createFetchStub(...responses: Response[]): {
  calls: FetchCall[];
  fetch: typeof fetch;
} {
  const pending = [...responses];
  const calls: FetchCall[] = [];

  const fetchStub: typeof fetch = async (input, init) => {
    calls.push({
      input: typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url,
      ...(init ? { init } : {}),
    });

    const response = pending.shift();
    if (!response) {
      throw new Error("Unexpected fetch invocation.");
    }

    return response;
  };

  return { calls, fetch: fetchStub };
}

function getHeaderValue(headers: HeaderSource | undefined, name: string): string | undefined {
  if (!headers) {
    return undefined;
  }

  const normalizedName = name.toLowerCase();

  if (headers instanceof Headers) {
    return headers.get(name) ?? headers.get(normalizedName) ?? undefined;
  }

  if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      if (key.toLowerCase() === normalizedName) {
        return value;
      }
    }
    return undefined;
  }

  for (const [key, value] of Object.entries(headers as Record<string, string>)) {
    if (key.toLowerCase() === normalizedName) {
      return value;
    }
  }

  return undefined;
}

function getJsonRequestBody(call: FetchCall): Record<string, unknown> {
  const body = call.init?.body;
  if (typeof body !== "string") {
    throw new Error("Expected the proxied request body to be a JSON string.");
  }

  return JSON.parse(body) as Record<string, unknown>;
}

test("ComposioProvider.name exposes the provider name", () => {
  const provider = new ComposioProvider({ apiKey: "test-api-key" });

  assert.equal(provider.name, "composio");
});

test("healthCheck(connectionId) returns true for an active connected account", async () => {
  const { calls, fetch } = createFetchStub(
    jsonResponse({ status: " active " }, { status: 200 }),
  );
  const provider = new ComposioProvider({ apiKey: "test-api-key", fetch });

  const healthy = await provider.healthCheck(" conn_123 ");

  assert.equal(healthy, true);
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0]?.input,
    "https://backend.composio.dev/api/v3/connected_accounts/conn_123",
  );
  assert.equal(calls[0]?.init?.method, "GET");
  assert.equal(getHeaderValue(calls[0]?.init?.headers, "x-api-key"), "test-api-key");
});

test("healthCheck(connectionId) returns false when the upstream account lookup fails", async () => {
  const { calls, fetch } = createFetchStub(
    jsonResponse({ error: { message: "not found" } }, { status: 404 }),
  );
  const provider = new ComposioProvider({ apiKey: "test-api-key", fetch });

  const healthy = await provider.healthCheck("conn_missing");

  assert.equal(healthy, false);
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0]?.input,
    "https://backend.composio.dev/api/v3/connected_accounts/conn_missing",
  );
});

test("proxy(request) normalizes outbound requests and inbound proxy responses", async () => {
  const { calls, fetch } = createFetchStub(
    // Connected account lookup response
    jsonResponse({ toolkit: { slug: "github" } }),
    // Proxy action execution response
    jsonResponse(
      {
        status: 201,
        headers: {
          "x-upstream": "envelope",
        },
        data: {
          ok: true,
          id: "pr_123",
        },
      },
      {
        status: 207,
        headers: {
          "x-request-id": "resp_123",
        },
      },
    ),
  );
  const provider = new ComposioProvider({ apiKey: "test-api-key", fetch });

  const request: ProxyRequest = {
    method: "POST",
    baseUrl: "https://api.github.com",
    endpoint: "repos/openai/openai/pulls",
    connectionId: " conn_123 ",
    headers: {
      authorization: "Bearer upstream-token",
      "x-request-id": "req_123",
      "x-composio-tool-slug": "github_create_pull_request",
      "x-composio-toolkit-slug": "github",
      "x-composio-toolkit-version": "2025.03",
      "x-composio-user-id": "user_123",
    },
    query: {
      state: "open",
    },
    body: {
      title: "Add provider tests",
    },
  };

  const response = await provider.proxy(request);

  assert.equal(calls.length, 2);
  // First call: connected account lookup
  assert.ok(calls[0]?.input?.toString().includes("/connected_accounts/"));
  // Second call: proxy execution
  assert.equal(calls[1]?.input, "https://backend.composio.dev/api/v3/tools/execute/proxy");
  assert.equal(calls[1]?.init?.method, "POST");
  assert.equal(getHeaderValue(calls[1]?.init?.headers, "x-api-key"), "test-api-key");

  assert.deepEqual(getJsonRequestBody(calls[1] as FetchCall), {
    connected_account_id: "conn_123",
    endpoint: "https://api.github.com/repos/openai/openai/pulls",
    method: "POST",
    parameters: [
      {
        in: "header",
        name: "authorization",
        value: "Bearer upstream-token",
      },
      {
        in: "header",
        name: "x-request-id",
        value: "req_123",
      },
      {
        in: "query",
        name: "state",
        value: "open",
      },
    ],
    body: {
      title: "Add provider tests",
    },
    user_id: "user_123",
    tool_slug: "github_create_pull_request",
    toolkit_slug: "github",
    toolkit_version: "2025.03",
  });

  assert.deepEqual(response, {
    status: 201,
    headers: {
      "content-type": "application/json",
      "x-request-id": "resp_123",
      "x-upstream": "envelope",
      "x-composio-tool-slug": "github_create_pull_request",
      "x-composio-toolkit-slug": "github",
      "x-composio-toolkit-version": "2025.03",
    },
    data: {
      ok: true,
      id: "pr_123",
    },
  });
});

test("normalizeComposioWebhook(rawPayload) produces the expected normalized shape", () => {
  const normalized = barrel.normalizeComposioWebhook({
    headers: {
      "x-composio-signature": "ignored-for-normalization",
    },
    body: JSON.stringify({
      trigger_name: "LINEAR_ISSUE_CREATED",
      metadata: {
        connected_account_id: "conn_linear_123",
      },
      data: {
        issue: {
          id: "issue_123",
        },
        title: "Broken sync",
      },
    }),
  });

  assert.deepEqual(normalized, {
    provider: "linear",
    connectionId: "conn_linear_123",
    eventType: "created",
    objectType: "issues",
    objectId: "issue_123",
    payload: {
      issue: {
        id: "issue_123",
      },
      title: "Broken sync",
    },
  });
});

test("webhook header helpers normalize Composio signature metadata", () => {
  const headers = new Headers({
    "X-Composio-Signature": "v1,abc123",
    "Svix-Id": "msg_123",
    "Svix-Timestamp": "1711111111",
    "X-Composio-Webhook-Version": "2024-02-01",
  });

  assert.equal(barrel.extractComposioWebhookSignatureHeaderName(headers), "x-composio-signature");
  assert.equal(barrel.extractComposioWebhookSignatureHeader(headers), "v1,abc123");
  assert.equal(barrel.extractComposioWebhookIdHeader(headers), "msg_123");
  assert.equal(barrel.extractComposioWebhookTimestampHeader(headers), "1711111111");
  assert.equal(barrel.extractComposioWebhookVersionHeader(headers), "2024-02-01");

  assert.deepEqual(barrel.parseComposioWebhookSignature(headers), {
    headerName: "x-composio-signature",
    raw: "v1,abc123",
    scheme: "v1",
    signature: "abc123",
    webhookId: "msg_123",
    webhookTimestamp: "1711111111",
    webhookVersion: "2024-02-01",
  });
});

test("normalizeComposioWebhook rejects callbacks without a connection identifier", () => {
  assert.throws(
    () =>
      barrel.normalizeComposioWebhook({
        trigger_name: "GITHUB_ISSUE_EVENT",
        data: {
          issue: {
            id: "issue_123",
          },
        },
      }),
    /missing a connection identifier/i,
  );
});

test("handleWebhook rejects malformed callback payloads", async () => {
  const provider = new ComposioProvider({ apiKey: "test-api-key" });

  await assert.rejects(
    provider.handleWebhook({
      body: "{not-valid-json",
    }),
    /not valid JSON/i,
  );
});

test("barrel exports compile and import cleanly", () => {
  assert.equal(barrel.ComposioProvider, ComposioProvider);
  assert.equal(typeof barrel.createComposioProvider, "function");
  assert.equal(typeof barrel.normalizeComposioWebhook, "function");

  const provider = barrel.createComposioProvider({ apiKey: "barrel-api-key" });

  assert.ok(provider instanceof barrel.ComposioProvider);
  assert.equal(provider.name, "composio");
});

test("listConnectedAccounts maps entity and integration filters to connected_accounts", async () => {
  const { calls, fetch } = createFetchStub(
    jsonResponse({
      items: [{ id: "ca_123", user_id: "user_123", auth_config_id: "ac_123" }],
    }),
  );
  const provider = new ComposioProvider({ apiKey: "test-api-key", fetch });

  const response = await provider.listConnectedAccounts({
    entityId: "user_123",
    integrationId: "ac_123",
    appName: "github",
    statuses: ["ACTIVE"],
    limit: 20,
  });

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0]?.input,
    "https://backend.composio.dev/api/v3/connected_accounts?user_ids=user_123&auth_config_ids=ac_123&toolkit_slugs=github&statuses=ACTIVE&limit=20",
  );
  assert.deepEqual(response.items, [{ id: "ca_123", user_id: "user_123", auth_config_id: "ac_123" }]);
});

test("initiateConnection(entityId, integrationId) creates an auth link session", async () => {
  const { calls, fetch } = createFetchStub(
    jsonResponse(
      {
        link_token: "link_123",
        redirect_url: "https://example.com/oauth",
        connected_account_id: "ca_123",
      },
      { status: 201 },
    ),
  );
  const provider = new ComposioProvider({ apiKey: "test-api-key", fetch });

  const response = await provider.initiateConnection("user_123", "ac_123", {
    callbackUrl: "https://app.example.com/callback",
    connectionData: { workspace: "openai" },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.input, "https://backend.composio.dev/api/v3/connected_accounts/link");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.deepEqual(getJsonRequestBody(calls[0] as FetchCall), {
    auth_config_id: "ac_123",
    user_id: "user_123",
    callback_url: "https://app.example.com/callback",
    connection_data: {
      workspace: "openai",
    },
  });
  assert.equal(response.redirect_url, "https://example.com/oauth");
});

test("listActions filters by app and tags while executeAction posts arguments for a user", async () => {
  const { calls, fetch } = createFetchStub(
    jsonResponse({
      items: [
        { slug: "github_create_issue", tags: ["issues", "write"] },
        { slug: "github_list_commits", tags: ["read"] },
      ],
    }),
    jsonResponse({
      successful: true,
      data: { id: 42 },
    }),
  );
  const provider = new ComposioProvider({ apiKey: "test-api-key", fetch });

  const actions = await provider.listActions({ appName: "github", tags: ["write"], limit: 10 });
  const execution = await provider.executeAction("github_create_issue", "user_123", {
    repo: "openai/openai",
    title: "Ship convenience layer",
  });

  assert.equal(
    calls[0]?.input,
    "https://backend.composio.dev/api/v3/tools?toolkit_slugs=github&limit=10",
  );
  assert.deepEqual(actions.items, [{ slug: "github_create_issue", tags: ["issues", "write"] }]);
  assert.equal(calls[1]?.input, "https://backend.composio.dev/api/v3/tools/execute/github_create_issue");
  assert.deepEqual(getJsonRequestBody(calls[1] as FetchCall), {
    user_id: "user_123",
    arguments: {
      repo: "openai/openai",
      title: "Ship convenience layer",
    },
  });
  assert.deepEqual(execution, {
    successful: true,
    data: { id: 42 },
  });
});

test("subscribeTrigger resolves the user's connected account and creates a trigger instance", async () => {
  const { calls, fetch } = createFetchStub(
    jsonResponse({
      slug: "SLACK_NEW_MESSAGE",
      toolkit: { slug: "slack" },
    }),
    jsonResponse({
      items: [{ id: "ca_slack_123", user_id: "user_123" }],
    }),
    jsonResponse(
      {
        id: "tr_123",
        connected_account_id: "ca_slack_123",
        status: "ACTIVE",
      },
      { status: 201 },
    ),
  );
  const provider = new ComposioProvider({ apiKey: "test-api-key", fetch });

  const response = await provider.subscribeTrigger("SLACK_NEW_MESSAGE", "user_123", {
    channel_id: "C123",
  });

  assert.equal(calls[0]?.input, "https://backend.composio.dev/api/v3/triggers_types/SLACK_NEW_MESSAGE");
  assert.equal(
    calls[1]?.input,
    "https://backend.composio.dev/api/v3/connected_accounts?user_ids=user_123&toolkit_slugs=slack&limit=1",
  );
  assert.equal(calls[2]?.input, "https://backend.composio.dev/api/v3/trigger_instances/SLACK_NEW_MESSAGE/upsert");
  assert.deepEqual(getJsonRequestBody(calls[2] as FetchCall), {
    connected_account_id: "ca_slack_123",
    trigger_config: {
      channel_id: "C123",
    },
  });
  assert.equal(response.id, "tr_123");
});

test("listIntegrations and listApps map to auth_configs and toolkits", async () => {
  const { calls, fetch } = createFetchStub(
    jsonResponse({
      items: [{ id: "ac_123", toolkit: { slug: "github" } }],
    }),
    jsonResponse({
      items: [{ slug: "github", name: "GitHub" }],
    }),
  );
  const provider = new ComposioProvider({ apiKey: "test-api-key", fetch });

  const integrations = await provider.listIntegrations({ appName: "github" });
  const apps = await provider.listApps({ search: "git" });

  assert.equal(calls[0]?.input, "https://backend.composio.dev/api/v3/auth_configs?toolkit_slug=github");
  assert.equal(calls[1]?.input, "https://backend.composio.dev/api/v3/toolkits?search=git");
  assert.equal(integrations.items[0]?.id, "ac_123");
  assert.equal(apps.items[0]?.slug, "github");
});

test("entity helpers treat entities as user ids backed by accounts and subscriptions", async () => {
  const { calls, fetch } = createFetchStub(
    jsonResponse({
      items: [
        { id: "ca_123", user_id: "user_123" },
        { id: "ca_456", user_id: "user_456" },
      ],
      next_cursor: "cursor_2",
    }),
    jsonResponse({
      items: [],
    }),
    jsonResponse({
      items: [{ id: "sub_123", user_id: "user_123" }],
    }),
    jsonResponse({
      items: [{ id: "ca_123", user_id: "user_123" }],
    }),
    jsonResponse({
      items: [{ id: "sub_123", user_id: "user_123" }],
    }),
    jsonResponse({
      items: [{ id: "ca_123", user_id: "user_123" }],
    }),
    jsonResponse({
      items: [{ id: "sub_123", user_id: "user_123" }],
    }),
    new Response(null, { status: 204 }),
    new Response(null, { status: 204 }),
  );
  const provider = new ComposioProvider({ apiKey: "test-api-key", fetch });

  const created = await provider.createEntity({ id: " user_999 " });
  const entities = await provider.listEntities();
  const entity = await provider.getEntity("user_123");
  await provider.deleteEntity("user_123");

  assert.deepEqual(created, {
    id: "user_999",
    connectedAccountIds: [],
    activeSubscriptionIds: [],
  });
  assert.deepEqual(entities, [
    {
      id: "user_123",
      connectedAccountIds: ["ca_123"],
      activeSubscriptionIds: ["sub_123"],
    },
    {
      id: "user_456",
      connectedAccountIds: ["ca_456"],
      activeSubscriptionIds: [],
    },
  ]);
  assert.deepEqual(entity, {
    id: "user_123",
    connectedAccountIds: ["ca_123"],
    activeSubscriptionIds: ["sub_123"],
  });
  assert.equal(
    calls[0]?.input,
    "https://backend.composio.dev/api/v3/connected_accounts?limit=100",
  );
  assert.equal(
    calls[1]?.input,
    "https://backend.composio.dev/api/v3/connected_accounts?limit=100&cursor=cursor_2",
  );
  assert.equal(
    calls[2]?.input,
    "https://backend.composio.dev/api/v3/trigger_instances/active?limit=100&show_disabled=true",
  );
  assert.equal(
    calls[7]?.input,
    "https://backend.composio.dev/api/v3/trigger_instances/manage/sub_123",
  );
  assert.equal(
    calls[8]?.input,
    "https://backend.composio.dev/api/v3/connected_accounts/ca_123",
  );
});
