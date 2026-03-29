import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_COMPOSIO_BASE_URL,
  createComposioProvider,
  resolveComposioProviderConfig,
} from "../index";

test("resolveComposioProviderConfig applies normalized bootstrap defaults", () => {
  const resolved = resolveComposioProviderConfig({
    auth: {
      apiKey: "  auth-api-key  ",
    },
    baseUrl: " https://backend.composio.dev/api/v3/ ",
    defaultToolset: {
      slug: " GitHub ",
      version: " 2025.03 ",
    },
    timeoutMs: 5_000,
    metadata: {
      source: "bootstrap-test",
      environment: "test",
      tags: ["bootstrap", "config"],
    },
  });

  assert.deepEqual(resolved, {
    apiKey: "auth-api-key",
    baseUrl: DEFAULT_COMPOSIO_BASE_URL,
    defaultToolset: {
      slug: "github",
      version: "2025.03",
    },
    timeoutMs: 5_000,
    metadata: {
      source: "bootstrap-test",
      environment: "test",
      tags: ["bootstrap", "config"],
    },
  });
});

test("createComposioProvider exposes normalized bootstrap config", () => {
  const provider = createComposioProvider({
    apiKey: " bootstrap-api-key ",
    defaultToolset: {
      slug: " Slack ",
    },
  });

  assert.equal(provider.name, "composio");
  assert.equal(provider.apiKey, "bootstrap-api-key");
  assert.equal(provider.baseUrl, DEFAULT_COMPOSIO_BASE_URL);
  assert.deepEqual(provider.defaultToolset, {
    slug: "slack",
  });
});
