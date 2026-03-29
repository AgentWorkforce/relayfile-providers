import assert from "node:assert/strict";
import test from "node:test";

import { NangoWebhookError } from "../errors.js";
import {
  buildAuthWebhook,
  buildForwardWebhook,
  buildSyncWebhook,
  malformedNangoWebhooks,
} from "./fixtures/nango-webhooks.js";
import { normalizeNangoWebhook } from "../webhook.js";

test("normalizes auth lifecycle payloads", () => {
  const scenarios = [
    {
      name: "creation success",
      payload: buildAuthWebhook({
        connectionId: "conn_created",
        operation: "creation",
        success: true,
      }),
      expectedEventType: "connection.created",
    },
    {
      name: "override failure",
      payload: buildAuthWebhook({
        connectionId: "conn_override",
        operation: "override",
        success: false,
        error: {
          code: "reauth_required",
          message: "The account must be reauthorized.",
        },
      }),
      expectedEventType: "connection.reauthorization_failed",
    },
    {
      name: "refresh success",
      payload: buildAuthWebhook({
        connectionId: "conn_refresh",
        operation: "refresh",
        success: true,
      }),
      expectedEventType: "connection.refreshed",
    },
  ] as const;

  for (const scenario of scenarios) {
    const normalized = normalizeNangoWebhook(scenario.payload);

    assert.equal(normalized.provider, "github", scenario.name);
    assert.equal(normalized.connectionId, scenario.payload.connectionId, scenario.name);
    assert.equal(normalized.eventType, scenario.expectedEventType, scenario.name);
    assert.equal(normalized.objectType, "connection", scenario.name);
    assert.equal(normalized.objectId, scenario.payload.connectionId, scenario.name);
    assert.deepEqual(
      normalized.payload,
      {
        from: "nango",
        provider: "github",
        providerConfigKey: "github",
        authMode: "OAUTH2",
        environment: "prod",
        operation: scenario.payload.operation,
        success: scenario.payload.success,
        tags: scenario.payload.tags ?? {},
        endUser: scenario.payload.endUser ?? scenario.payload.end_user ?? {},
        error: scenario.payload.error ?? {},
        rawPayload: scenario.payload,
      },
      scenario.name,
    );
  }
});

test("normalizes sync lifecycle payloads", () => {
  const scenarios = [
    {
      name: "started",
      payload: buildSyncWebhook({
        connectionId: "conn_sync_started",
        operation: "started",
        startedAt: "2026-03-28T10:01:00.000Z",
      }),
      expectedEventType: "sync.started",
      expectedStage: "started",
      expectedSuccess: null,
    },
    {
      name: "completed",
      payload: buildSyncWebhook({
        connectionId: "conn_sync_completed",
        success: true,
        modifiedAfter: "2026-03-28T10:05:00.000Z",
        responseResults: {
          added: 2,
          updated: 1,
          deleted: 0,
        },
      }),
      expectedEventType: "sync.completed",
      expectedStage: "completed",
      expectedSuccess: true,
    },
    {
      name: "failed",
      payload: buildSyncWebhook({
        connectionId: "conn_sync_failed",
        success: false,
        failedAt: "2026-03-28T10:06:00.000Z",
        error: {
          code: "sync_failed",
          message: "The provider returned a 500 response.",
        },
      }),
      expectedEventType: "sync.failed",
      expectedStage: "failed",
      expectedSuccess: false,
    },
  ] as const;

  for (const scenario of scenarios) {
    const normalized = normalizeNangoWebhook(scenario.payload);

    assert.equal(normalized.provider, "github", scenario.name);
    assert.equal(normalized.connectionId, scenario.payload.connectionId, scenario.name);
    assert.equal(normalized.eventType, scenario.expectedEventType, scenario.name);
    assert.equal(normalized.objectType, "sync", scenario.name);
    assert.equal(
      normalized.objectId,
      `${scenario.payload.connectionId}:${scenario.payload.syncName}`,
      scenario.name,
    );
    assert.deepEqual(
      normalized.payload,
      {
        from: "nango",
        providerConfigKey: "github",
        syncName: scenario.payload.syncName,
        syncVariant: "default",
        model: "issue",
        syncType: "INCREMENTAL",
        stage: scenario.expectedStage,
        success: scenario.expectedSuccess,
        modifiedAfter: scenario.payload.modifiedAfter ?? scenario.payload.modified_after ?? null,
        responseResults: scenario.payload.responseResults ?? scenario.payload.response_results ?? {},
        checkpoints: scenario.payload.checkpoints ?? null,
        error: scenario.payload.error ?? {},
        startedAt: scenario.payload.startedAt ?? scenario.payload.started_at ?? null,
        failedAt: scenario.payload.failedAt ?? scenario.payload.failed_at ?? null,
        rawPayload: scenario.payload,
      },
      scenario.name,
    );
  }
});

test("normalizes forwarded payloads with provider and object metadata", () => {
  const payload = buildForwardWebhook({
    from: "nango",
    provider: "hubspot",
    providerConfigKey: "hubspot",
    provider_config_key: "hubspot",
    connectionId: "conn_forward",
    payload: {
      metadata: {
        event_type: "contact.updated",
        action: "updated",
        topic: "contact",
      },
      data: {
        object: {
          id: 42,
          object: "contact",
        },
      },
    },
  });

  const normalized = normalizeNangoWebhook(payload);

  assert.deepEqual(normalized, {
    provider: "hubspot",
    connectionId: "conn_forward",
    eventType: "contact.updated",
    objectType: "contact",
    objectId: "42",
    payload: {
      from: "hubspot",
      providerConfigKey: "hubspot",
      forwardedEventType: "contact.updated",
      forwardedObjectType: "contact",
      forwardedObjectId: "42",
      forwardedAction: "updated",
      forwardedTopic: "contact",
      forwardedMetadata: {
        event_type: "contact.updated",
        action: "updated",
        topic: "contact",
      },
      forwardedObject: {
        id: 42,
        object: "contact",
      },
      rawPayload: payload.payload,
      rawWebhook: payload,
    },
  });
});

test("normalizes payloads with provider and object metadata from nested generic data", () => {
  const payload = {
    type: "contact.updated",
    provider: "hubspot",
    connectionId: "conn_generic",
    connection_id: "conn_generic",
    providerConfigKey: "hubspot",
    provider_config_key: "hubspot",
    data: {
      model: "contact",
      object_id: 42,
      status: "ACTIVE",
    },
  };

  const normalized = normalizeNangoWebhook(payload);

  assert.deepEqual(normalized, {
    provider: "hubspot",
    connectionId: "conn_generic",
    eventType: "contact.updated",
    objectType: "contact",
    objectId: "42",
    payload: {
      model: "contact",
      object_id: 42,
      status: "ACTIVE",
      providerConfigKey: "hubspot",
      rawPayload: payload.data,
      rawWebhook: payload,
    },
  });
});

test("rejects payloads missing required connection or event data", () => {
  const scenarios = [
    {
      name: "missing connection id",
      payload: malformedNangoWebhooks.missingConnectionId,
      message: "connectionId",
    },
    {
      name: "missing forwarded event metadata",
      payload: malformedNangoWebhooks.missingEventType,
      message: "missing explicit event metadata",
    },
    {
      name: "indeterminate sync stage",
      payload: buildSyncWebhook({
        success: undefined,
        operation: undefined,
        status: undefined,
        event: undefined,
        startedAt: undefined,
        started_at: undefined,
        failedAt: undefined,
        failed_at: undefined,
        modifiedAfter: undefined,
        modified_after: undefined,
        responseResults: undefined,
        response_results: undefined,
        error: undefined,
      }),
      message: "did not include enough state",
    },
  ] as const;

  for (const scenario of scenarios) {
    expectWebhookError(scenario.payload, scenario.message, scenario.name);
  }
});

test("rejects malformed webhook payloads", () => {
  const scenarios = [
    {
      name: "invalid json",
      payload: malformedNangoWebhooks.invalidJson,
      message: "not valid JSON",
    },
    {
      name: "serialized array",
      payload: malformedNangoWebhooks.serializedArray,
      message: "must be a JSON object",
    },
    {
      name: "null payload",
      payload: null,
      message: "must be a JSON object",
    },
  ] as const;

  for (const scenario of scenarios) {
    expectWebhookError(scenario.payload, scenario.message, scenario.name);
  }
});

function expectWebhookError(payload: unknown, message: string, assertionMessage: string): void {
  assert.throws(
    () => normalizeNangoWebhook(payload),
    (error: unknown) =>
      error instanceof NangoWebhookError &&
      error.message.includes(message),
    assertionMessage,
  );
}
