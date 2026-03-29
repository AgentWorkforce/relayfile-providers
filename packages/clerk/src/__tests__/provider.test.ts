import assert from "node:assert/strict";
import test from "node:test";

import { ClerkProvider } from "../provider.js";

test("proxy resolves Clerk OAuth token and injects bearer auth", async () => {
  const calls: Array<{ input: string; init: RequestInit | undefined }> = [];
  const fetchMock: typeof fetch = async (input, init) => {
    calls.push({ input: String(input), init });

    if (calls.length === 1) {
      return new Response(
        JSON.stringify({
          data: [{ provider: "oauth_github", token: "github-access-token" }],
          totalCount: 1,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ login: "relayfile" }), {
      status: 200,
      headers: { "content-type": "application/json", "x-test": "ok" },
    });
  };

  const client = {
    ingestWebhook: async () => ({ status: "queued" as const, id: "ing_123" }),
  } as never;

  const provider = new ClerkProvider(client, {
    secretKey: "sk_test_123",
    fetch: fetchMock,
  });

  const response = await provider.proxy({
    method: "GET",
    baseUrl: "https://api.github.com",
    endpoint: "/user",
    connectionId: "user_123",
    headers: {
      "x-clerk-provider": "oauth_github",
      accept: "application/json",
    },
  });

  assert.equal(calls.length, 2);
  assert.equal(
    calls[0]?.input,
    "https://api.clerk.com/v1/users/user_123/oauth_access_tokens/oauth_github",
  );
  assert.equal(
    (calls[1]?.init?.headers as Record<string, string>).authorization,
    "Bearer github-access-token",
  );
  assert.equal((calls[1]?.init?.headers as Record<string, string>).accept, "application/json");
  assert.equal(
    (calls[1]?.init?.headers as Record<string, string>)["x-clerk-provider"],
    undefined,
  );
  assert.deepEqual(response.data, { login: "relayfile" });
  assert.equal(response.headers["x-test"], "ok");
});

test("provider request keeps Clerk secret auth even if caller supplies authorization", async () => {
  const seenHeaders: Array<Record<string, string>> = [];
  const provider = new ClerkProvider(
    {
      ingestWebhook: async () => ({ status: "queued" as const, id: "ing_auth" }),
    } as never,
    {
      secretKey: "sk_test_123",
      fetch: async (_input, init) => {
        seenHeaders.push((init?.headers ?? {}) as Record<string, string>);
        return jsonResponse({ id: "user_123" });
      },
    },
  );

  await provider.request({
    method: "GET",
    path: "/v1/users/user_123",
    headers: {
      authorization: "Bearer user_supplied_value",
    },
  });

  assert.equal(seenHeaders[0]?.authorization, "Bearer sk_test_123");
});

test("ingestWebhook normalizes a Clerk event and forwards it to Relayfile", async () => {
  let ingestCall:
    | {
        workspaceId: string;
        provider: string;
        event_type: string;
        path: string;
        data: unknown;
      }
    | undefined;

  const client = {
    ingestWebhook: async (input: typeof ingestCall) => {
      ingestCall = input;
      return { status: "queued" as const, id: "ing_456" };
    },
  } as never;

  const provider = new ClerkProvider(client, {
    secretKey: "sk_test_123",
    fetch: async () =>
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  });

  const result = await provider.ingestWebhook("ws_123", {
    type: "user.updated",
    data: {
      id: "user_123",
      first_name: "Khaliq",
    },
  });

  assert.equal(result.status, "queued");
  assert.deepEqual(ingestCall, {
    workspaceId: "ws_123",
    provider: "clerk",
    event_type: "updated",
    path: "/clerk/users/user_123.json",
    data: {
      id: "user_123",
      first_name: "Khaliq",
    },
  });
});

test("user and organization convenience methods use Clerk endpoints", async () => {
  const seen: string[] = [];
  const fetchMock: typeof fetch = async (input, init) => {
    seen.push(`${init?.method ?? "GET"} ${String(input)}`);
    const url = String(input);

    if (url.includes("/v1/users?")) {
      return jsonResponse({ data: [{ id: "user_123" }], totalCount: 1 });
    }
    if (url.endsWith("/v1/users/user_123")) {
      return jsonResponse({ id: "user_123", external_accounts: [{ id: "ea_123" }] });
    }
    if (url.endsWith("/v1/organizations/org_123/invitations")) {
      return jsonResponse({ id: "oi_123", emailAddress: "test@example.com", role: "org:member" });
    }
    if (url.includes("/v1/organizations?")) {
      return jsonResponse({ data: [{ id: "org_123" }], totalCount: 1 });
    }

    return jsonResponse({});
  };

  const provider = new ClerkProvider(
    {
      ingestWebhook: async () => ({ status: "queued" as const, id: "ing_789" }),
    } as never,
    {
      secretKey: "sk_test_123",
      fetch: fetchMock,
    },
  );

  const users = await provider.listUsers({ limit: 1, email: "test@example.com" });
  const externalAccounts = await provider.getUserExternalAccounts("user_123");
  const organizations = await provider.listOrganizations({ limit: 1 });
  const invitation = await provider.createOrgInvitation(
    "org_123",
    "test@example.com",
    "org:member",
  );

  assert.equal(users.totalCount, 1);
  assert.equal(externalAccounts[0]?.id, "ea_123");
  assert.equal(organizations.data[0]?.id, "org_123");
  assert.equal(invitation.id, "oi_123");
  assert.ok(seen.some((entry) => entry.startsWith("GET https://api.clerk.com/v1/users?")));
  assert.ok(
    seen.some((entry) =>
      entry.startsWith("POST https://api.clerk.com/v1/organizations/org_123/invitations"),
    ),
  );
});

test("list methods normalize Clerk snake_case pagination metadata", async () => {
  const provider = new ClerkProvider(
    {
      ingestWebhook: async () => ({ status: "queued" as const, id: "ing_page" }),
    } as never,
    {
      secretKey: "sk_test_123",
      fetch: async (input) => {
        const url = String(input);
        if (url.includes("/v1/users?")) {
          return jsonResponse({ data: [{ id: "user_123" }], total_count: 1 });
        }
        if (url.includes("/v1/organizations?")) {
          return jsonResponse({ data: [{ id: "org_123" }], total_count: 1 });
        }
        if (url.includes("/v1/sessions?")) {
          return jsonResponse({ data: [{ id: "sess_123" }], total_count: 1 });
        }
        if (url.includes("/memberships?")) {
          return jsonResponse({ data: [{ id: "mem_123" }], total_count: 1 });
        }
        return jsonResponse({ data: [{ token: "tok_123", provider: "oauth_github" }], total_count: 1 });
      },
    },
  );

  const [users, organizations, sessions, members, oauthTokens] = await Promise.all([
    provider.listUsers({ limit: 1 }),
    provider.listOrganizations({ limit: 1 }),
    provider.listSessions({ limit: 1 }),
    provider.listOrgMembers("org_123", { limit: 1 }),
    provider.getOAuthTokenList("user_123", "oauth_github"),
  ]);

  assert.equal(users.totalCount, 1);
  assert.equal(organizations.totalCount, 1);
  assert.equal(sessions.totalCount, 1);
  assert.equal(members.totalCount, 1);
  assert.equal(oauthTokens.totalCount, 1);
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
