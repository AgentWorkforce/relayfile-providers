import { z } from "zod";

const NangoWebhookEnvelopeCommonShape = {
  from: z.string(),
  connectionId: z.string().nullable().optional(),
  connection_id: z.string().nullable().optional(),
  providerConfigKey: z.string().optional(),
  provider_config_key: z.string().optional(),
  payload: z.unknown().optional(),
};

export const NangoForwardWebhookEnvelopeSchema = z
  .object({
    ...NangoWebhookEnvelopeCommonShape,
    type: z.literal("forward"),
  })
  .passthrough();

export const NangoAuthWebhookEnvelopeSchema = z
  .object({
    ...NangoWebhookEnvelopeCommonShape,
    type: z.literal("auth"),
  })
  .passthrough();

export const NangoConnectionCreatedWebhookEnvelopeSchema = z
  .object({
    ...NangoWebhookEnvelopeCommonShape,
    type: z.literal("connection.created"),
  })
  .passthrough();

export const NangoSyncWebhookEnvelopeSchema = z
  .object({
    ...NangoWebhookEnvelopeCommonShape,
    type: z.literal("sync"),
  })
  .passthrough();

export const NangoActionWebhookEnvelopeSchema = z
  .object({
    ...NangoWebhookEnvelopeCommonShape,
    type: z.literal("action"),
  })
  .passthrough();

export const NangoWebhookEnvelopeSchema = z.discriminatedUnion("type", [
  NangoForwardWebhookEnvelopeSchema,
  NangoAuthWebhookEnvelopeSchema,
  NangoConnectionCreatedWebhookEnvelopeSchema,
  NangoSyncWebhookEnvelopeSchema,
  NangoActionWebhookEnvelopeSchema,
]);

export const NangoEndUserSchema = z
  .object({
    endUserId: z.string().optional(),
    organizationId: z.string().optional(),
    tags: z.record(z.string(), z.string()).optional(),
  })
  .passthrough();

export const NangoAuthErrorSchema = z
  .object({
    type: z.string(),
    description: z.string(),
  })
  .passthrough();

export const NangoAuthCreationEventSchema = z
  .object({
    from: z.string().optional(),
    type: z.literal("auth"),
    operation: z.literal("creation"),
    success: z.literal(true),
    provider: z.string(),
    providerConfigKey: z.string(),
    connectionId: z.string(),
    environment: z.string(),
    endUser: NangoEndUserSchema.optional(),
    error: NangoAuthErrorSchema.optional(),
  })
  .passthrough();

export const NangoSyncResponseResultsSchema = z
  .object({
    added: z.number().int().nonnegative(),
    updated: z.number().int().nonnegative(),
    deleted: z.number().int().nonnegative(),
  })
  .passthrough();

export const NangoSyncNotificationEventSchema = z
  .object({
    from: z.string().optional(),
    type: z.literal("sync"),
    syncType: z.enum(["INITIAL", "INCREMENTAL", "WEBHOOK"]),
    syncName: z.string(),
    model: z.string(),
    providerConfigKey: z.string(),
    connectionId: z.string(),
    responseResults: NangoSyncResponseResultsSchema,
    modifiedAfter: z.string().datetime(),
    success: z.boolean(),
    queryTimeStamp: z.string().datetime().optional(),
    startedAt: z.string().datetime().optional(),
    failedAt: z.string().datetime().nullable().optional(),
  })
  .passthrough();

export const NotionDatabaseRecordSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  description: z.string(),
  properties: z.array(z.string()),
  last_edited_time: z.string(),
});

export const NotionPageRecordSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  parent_type: z.string(),
  parent_id: z.string(),
  last_edited_time: z.string(),
  content_preview: z.string(),
});

export const NotionContentMetadataRecordSchema = z.object({
  id: z.string(),
  path: z.string().optional(),
  type: z.enum(["page", "database"]),
  last_modified: z.string(),
  title: z.string().optional(),
  parent_id: z.string().optional(),
});

export const NOTION_SUPPORTED_MODELS = [
  "NotionDatabase",
  "NotionPage",
  "NotionContentMetadata",
] as const;

export const NotionSupportedModelSchema = z.enum(NOTION_SUPPORTED_MODELS);

export const NotionRecordActionSchema = z.enum(["ADDED", "UPDATED", "DELETED"]);

export const NangoRecordMetadataSchema = z.object({
  last_action: NotionRecordActionSchema,
  deleted_at: z.string().nullable().optional(),
  cursor: z.string().optional(),
  first_seen_at: z.string().optional(),
  last_modified_at: z.string().optional(),
});

export const NotionDatabaseNangoRecordSchema = NotionDatabaseRecordSchema.extend({
  _nango_metadata: NangoRecordMetadataSchema,
});

export const NotionPageNangoRecordSchema = NotionPageRecordSchema.extend({
  _nango_metadata: NangoRecordMetadataSchema,
});

export const NotionContentMetadataNangoRecordSchema =
  NotionContentMetadataRecordSchema.extend({
    _nango_metadata: NangoRecordMetadataSchema,
  });

export const NotionRecordSchema = z.union([
  NotionDatabaseNangoRecordSchema,
  NotionPageNangoRecordSchema,
  NotionContentMetadataNangoRecordSchema,
]);

export const DiscriminatedNotionRecordSchema = z.discriminatedUnion("model", [
  z.object({
    model: z.literal("NotionDatabase"),
    record: NotionDatabaseNangoRecordSchema,
  }),
  z.object({
    model: z.literal("NotionPage"),
    record: NotionPageNangoRecordSchema,
  }),
  z.object({
    model: z.literal("NotionContentMetadata"),
    record: NotionContentMetadataNangoRecordSchema,
  }),
]);

export type NangoWebhookEnvelope = z.infer<typeof NangoWebhookEnvelopeSchema>;
export type NangoAuthCreationEvent = z.infer<typeof NangoAuthCreationEventSchema>;
export type NangoSyncNotificationEvent = z.infer<
  typeof NangoSyncNotificationEventSchema
>;
export type NotionDatabaseRecord = z.infer<typeof NotionDatabaseRecordSchema>;
export type NotionPageRecord = z.infer<typeof NotionPageRecordSchema>;
export type NotionContentMetadataRecord = z.infer<
  typeof NotionContentMetadataRecordSchema
>;
export type NotionSupportedModel = (typeof NOTION_SUPPORTED_MODELS)[number];
export type NotionRecordAction = z.infer<typeof NotionRecordActionSchema>;
export type NangoRecordMetadata = z.infer<typeof NangoRecordMetadataSchema>;
export type NotionRecord = z.infer<typeof NotionRecordSchema>;
export type DiscriminatedNotionRecord = z.infer<
  typeof DiscriminatedNotionRecordSchema
>;

export type DiscriminatedNotionEvent =
  | { kind: "sync"; payload: NangoSyncNotificationEvent }
  | { kind: "auth-creation"; payload: NangoAuthCreationEvent }
  | { kind: "ignore" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function normalizeEventCandidate(
  envelope: NangoWebhookEnvelope,
): Record<string, unknown> {
  const envelopeRecord = envelope as unknown as Record<string, unknown>;
  const payloadRecord = isRecord(envelope.payload) ? envelope.payload : {};
  const providerConfigKey =
    envelope.providerConfigKey ??
    envelope.provider_config_key ??
    readString(payloadRecord, "providerConfigKey") ??
    readString(payloadRecord, "provider_config_key");
  const connectionId =
    envelope.connectionId ??
    envelope.connection_id ??
    readString(payloadRecord, "connectionId") ??
    readString(payloadRecord, "connection_id");

  return {
    ...envelopeRecord,
    ...payloadRecord,
    type: envelope.type,
    from: envelope.from,
    providerConfigKey,
    connectionId,
  };
}

function isNotionEvent(candidate: Record<string, unknown>): boolean {
  const providerConfigKey = readString(candidate, "providerConfigKey");
  const provider = readString(candidate, "provider");

  return (
    providerConfigKey?.toLowerCase() === "notion" ||
    provider?.toLowerCase() === "notion"
  );
}

export function discriminateNotionEvent(
  envelope: unknown,
): DiscriminatedNotionEvent {
  const parsedEnvelope = NangoWebhookEnvelopeSchema.safeParse(envelope);
  if (!parsedEnvelope.success) {
    return { kind: "ignore" };
  }

  const candidate = normalizeEventCandidate(parsedEnvelope.data);

  if (parsedEnvelope.data.type === "sync") {
    const parsedSync = NangoSyncNotificationEventSchema.safeParse(candidate);
    if (!parsedSync.success || !isNotionEvent(candidate)) {
      return { kind: "ignore" };
    }

    return { kind: "sync", payload: parsedSync.data };
  }

  if (parsedEnvelope.data.type === "auth") {
    const parsedAuth = NangoAuthCreationEventSchema.safeParse(candidate);
    if (!parsedAuth.success || !isNotionEvent(candidate)) {
      return { kind: "ignore" };
    }

    return { kind: "auth-creation", payload: parsedAuth.data };
  }

  return { kind: "ignore" };
}

export const nangoWebhookEnvelopeSchema = NangoWebhookEnvelopeSchema;
export const nangoAuthCreationEventSchema = NangoAuthCreationEventSchema;
export const nangoSyncNotificationEventSchema = NangoSyncNotificationEventSchema;
export const notionDatabaseRecordSchema = NotionDatabaseRecordSchema;
export const notionPageRecordSchema = NotionPageRecordSchema;
export const notionContentMetadataRecordSchema =
  NotionContentMetadataRecordSchema;
export const notionRecordSchema = NotionRecordSchema;
export const nangoRecordMetadataSchema = NangoRecordMetadataSchema;
