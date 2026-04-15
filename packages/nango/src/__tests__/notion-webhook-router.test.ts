import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { discriminateNotionEvent } from "../notion-ingest-schema.js";

const BASE_SYNC_EVENT = {
  from: "nango",
  type: "sync",
  syncType: "INCREMENTAL",
  syncName: "notion-pages",
  model: "NotionPage",
  providerConfigKey: "notion",
  connectionId: "conn_notion_test_001",
  responseResults: {
    added: 1,
    updated: 2,
    deleted: 0,
  },
  modifiedAfter: "2026-04-15T18:00:00.000Z",
  success: true,
};

const BASE_AUTH_EVENT = {
  from: "nango",
  type: "auth",
  operation: "creation",
  success: true,
  provider: "notion",
  providerConfigKey: "notion",
  connectionId: "conn_notion_test_001",
  environment: "prod",
};

describe("notion webhook router discriminator", () => {
  it("classifies notion sync notifications for router dispatch", () => {
    const event = discriminateNotionEvent(BASE_SYNC_EVENT);

    assert.equal(event.kind, "sync");
    if (event.kind === "sync") {
      assert.equal(event.payload.connectionId, "conn_notion_test_001");
      assert.equal(event.payload.providerConfigKey, "notion");
      assert.equal(event.payload.model, "NotionPage");
      assert.equal(event.payload.syncName, "notion-pages");
    }
  });

  it("classifies notion auth creation events for bulk ingest dispatch", () => {
    const event = discriminateNotionEvent(BASE_AUTH_EVENT);

    assert.equal(event.kind, "auth-creation");
    if (event.kind === "auth-creation") {
      assert.equal(event.payload.connectionId, "conn_notion_test_001");
      assert.equal(event.payload.providerConfigKey, "notion");
    }
  });

  it("normalizes nested Nango event fields", () => {
    const {
      connectionId: _connectionId,
      providerConfigKey: _providerConfigKey,
      ...syncEventWithoutCanonicalIds
    } = BASE_SYNC_EVENT;
    const event = discriminateNotionEvent({
      from: "nango",
      type: "sync",
      payload: {
        ...syncEventWithoutCanonicalIds,
        provider_config_key: "notion",
        connection_id: "conn_nested",
      },
    });

    assert.equal(event.kind, "sync");
    if (event.kind === "sync") {
      assert.equal(event.payload.connectionId, "conn_nested");
      assert.equal(event.payload.providerConfigKey, "notion");
    }
  });

  it("ignores non-notion and non-creation auth events", () => {
    assert.deepEqual(
      discriminateNotionEvent({
        ...BASE_AUTH_EVENT,
        provider: "github",
        providerConfigKey: "github",
      }),
      { kind: "ignore" },
    );
    assert.deepEqual(
      discriminateNotionEvent({
        ...BASE_AUTH_EVENT,
        operation: "refresh",
      }),
      { kind: "ignore" },
    );
  });
});
