import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCredentialProxyHeaders,
  extractCredentialAccessToken,
  getCredentialSchema,
  listCredentials,
} from "../index.js";
import type { N8nCredential, N8nRequestExecutor } from "../index.js";

const executor: N8nRequestExecutor = {
  async request<T>() {
    return {
      data: [
        {
          id: "1",
          name: "GitHub",
          type: "githubApi",
          data: { token: "gh-token" },
        },
      ],
      nextCursor: "next-1",
    } as T;
  },
  async requestWithFallback<T>() {
    return {
      name: "githubApi",
      displayName: "GitHub API",
      properties: [
        {
          name: "token",
          type: "string",
          required: true,
        },
      ],
    } as T;
  },
};

test("listCredentials normalizes paginated credential responses", async () => {
  const result = await listCredentials(executor, { type: "githubApi", limit: 10 });

  assert.equal(result.data.length, 1);
  assert.equal(result.data[0]!.id, "1");
  assert.equal(result.data[0]!.data?.token, "gh-token");
  assert.equal(result.nextCursor, "next-1");
});

test("getCredentialSchema normalizes fallback schema shapes", async () => {
  const schema = await getCredentialSchema(executor, "githubApi");

  assert.equal(schema.type, "githubApi");
  assert.equal(schema.properties[0]!.name, "token");
});

test("extractCredentialAccessToken and buildCredentialProxyHeaders support known credential types", () => {
  const credential: N8nCredential = {
    id: "1",
    name: "GitHub",
    type: "githubApi",
    data: { token: "gh-token" },
    raw: {},
  };

  const token = extractCredentialAccessToken(credential);
  const headers = buildCredentialProxyHeaders(credential, token);

  assert.equal(token, "gh-token");
  assert.equal(headers.Authorization, "Bearer gh-token");
});

test("buildCredentialProxyHeaders supports basic auth and custom header credentials", () => {
  const basicCredential: N8nCredential = {
    id: "2",
    name: "Basic",
    type: "httpBasicAuth",
    data: { username: "relay", password: "file" },
    raw: {},
  };
  const headerCredential: N8nCredential = {
    id: "3",
    name: "Header",
    type: "customApi",
    data: { headerName: "X-API-Key", value: "secret" },
    raw: {},
  };

  const basicHeaders = buildCredentialProxyHeaders(
    basicCredential,
    extractCredentialAccessToken(basicCredential),
  );
  const headerHeaders = buildCredentialProxyHeaders(
    headerCredential,
    extractCredentialAccessToken(headerCredential),
  );

  assert.match(basicHeaders.Authorization ?? "", /^Basic /);
  assert.equal(headerHeaders["X-API-Key"], "secret");
});

test("extractCredentialAccessToken uses credential-type specific fields for header and basic auth", () => {
  const headerCredential: N8nCredential = {
    id: "4",
    name: "Header",
    type: "httpHeaderAuth",
    data: { name: "X-API-Key", value: "secret" },
    raw: {},
  };
  const basicCredential: N8nCredential = {
    id: "5",
    name: "Basic",
    type: "httpBasicAuth",
    data: { username: "relay", password: "file" },
    raw: {},
  };

  assert.equal(extractCredentialAccessToken(headerCredential), "secret");
  assert.equal(extractCredentialAccessToken(basicCredential), "file");
});
