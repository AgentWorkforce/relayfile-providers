import test from "node:test";
import assert from "node:assert/strict";
import { PipedreamProvider } from "../provider.js";
import { createRelayFileClientMock, jsonResponse } from "./helpers.js";

test("listAccounts normalizes account pages", async () => {
  const provider = new PipedreamProvider(createRelayFileClientMock(), {
    clientId: "cid",
    clientSecret: "secret",
    projectId: "proj_123",
    fetch: async (input) => {
      const url = String(input);
      if (url.endsWith("/v1/oauth/token")) {
        return jsonResponse({
          body: {
            access_token: "server_token",
            token_type: "bearer",
            expires_in: 3600,
          },
        });
      }
      return jsonResponse({
        body: {
          data: [
            {
              id: "apn_123",
              name: "Slack",
              healthy: true,
              external_user_id: "user_123",
              app: {
                name_slug: "slack",
                name: "Slack",
                img_src: "https://example.com/slack.svg",
                custom_fields_json: null,
                categories: ["Communication"],
                featured_weight: 1,
              },
            },
          ],
          page_info: {
            end_cursor: "cursor_2",
          },
        },
      });
    },
  });

  const result = await provider.listAccounts({ externalUserId: "user_123" });
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0]?.id, "apn_123");
  assert.equal(result.data[0]?.app?.slug, "slack");
  assert.equal(result.pageInfo.endCursor, "cursor_2");
});

test("proxy forwards requests through Pipedream proxy", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const provider = new PipedreamProvider(createRelayFileClientMock(), {
    clientId: "cid",
    clientSecret: "secret",
    projectId: "proj_123",
    fetch: async (input, init) => {
      calls.push({ url: String(input), init });
      if (String(input).endsWith("/v1/oauth/token")) {
        return jsonResponse({
          body: {
            access_token: "server_token",
            token_type: "bearer",
            expires_in: 3600,
          },
        });
      }
      if (String(input).includes("/accounts/apn_123")) {
        return jsonResponse({
          body: {
            id: "apn_123",
            healthy: true,
            app: {
              name_slug: "slack",
              name: "Slack",
              img_src: "https://example.com/slack.svg",
              custom_fields_json: null,
              categories: [],
              featured_weight: 1,
            },
          },
        });
      }
      return jsonResponse({ body: { ok: true } });
    },
  });

  const response = await provider.proxy({
    method: "POST",
    baseUrl: "https://slack.com",
    endpoint: "/api/chat.postMessage",
    connectionId: "apn_123",
    headers: {
      "content-type": "application/json",
      "x-pd-external-user-id": "user_123",
    },
    body: {
      text: "hello",
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.data, { ok: true });
  assert.match(calls.at(-1)?.url ?? "", /external_user_id=user_123/);
  assert.match(calls.at(-1)?.url ?? "", /account_id=apn_123/);
});

test("getAccessToken extracts account credentials", async () => {
  const provider = new PipedreamProvider(createRelayFileClientMock(), {
    clientId: "cid",
    clientSecret: "secret",
    projectId: "proj_123",
    fetch: async (input) => {
      const url = String(input);
      if (url.endsWith("/v1/oauth/token")) {
        return jsonResponse({
          body: {
            access_token: "server_token",
            token_type: "bearer",
            expires_in: 3600,
          },
        });
      }
      return jsonResponse({
        body: {
          id: "apn_123",
          credentials: {
            access_token: "account_token",
          },
          app: {
            name_slug: "slack",
            name: "Slack",
            img_src: "https://example.com/slack.svg",
            custom_fields_json: null,
            categories: [],
            featured_weight: 1,
          },
        },
      });
    },
  });

  assert.equal(await provider.getAccessToken("apn_123"), "account_token");
});

test("listUsers forwards before/cursor pagination to accounts", async () => {
  const calls: string[] = [];
  const provider = new PipedreamProvider(createRelayFileClientMock(), {
    clientId: "cid",
    clientSecret: "secret",
    projectId: "proj_123",
    fetch: async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith("/v1/oauth/token")) {
        return jsonResponse({
          body: {
            access_token: "server_token",
            token_type: "bearer",
            expires_in: 3600,
          },
        });
      }
      return jsonResponse({
        body: {
          data: [
            {
              id: "apn_123",
              external_user_id: "user_123",
              app: {
                name_slug: "slack",
                name: "Slack",
                img_src: "https://example.com/slack.svg",
                custom_fields_json: null,
                categories: [],
                featured_weight: 1,
              },
            },
          ],
          page_info: {
            start_cursor: "cursor_1",
            end_cursor: "cursor_2",
          },
        },
      });
    },
  });

  const result = await provider.listUsers({
    cursor: "cursor_after",
    before: "cursor_before",
    limit: 10,
  });

  assert.equal(result.data[0]?.externalUserId, "user_123");
  assert.equal(result.pageInfo.startCursor, "cursor_1");
  assert.match(calls.at(-1) ?? "", /after=cursor_after/);
  assert.match(calls.at(-1) ?? "", /before=cursor_before/);
  assert.match(calls.at(-1) ?? "", /limit=10/);
});
