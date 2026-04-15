import {
  recordNotionIngest,
  type NotionIngestOutcome,
} from "./notion-ingest-audit.js";
import {
  DiscriminatedNotionRecordSchema,
  type DiscriminatedNotionRecord,
  type NotionRecordAction,
  type NotionSupportedModel,
} from "./notion-ingest-schema.js";
import type { fetchNangoRecords } from "./notion-records-client.js";

export type NotionIngestResult = {
  filesWritten: number;
  filesUpdated: number;
  filesDeleted: number;
  paths: string[];
  errors: Array<{ path: string; error: string }>;
};

export type NotionIngestAdapter = {
  ingestDatabase(
    workspaceId: string,
    databaseId: string,
  ): Promise<NotionIngestResult>;
  ingestPage(
    workspaceId: string,
    pageId: string,
    databaseId?: string,
  ): Promise<NotionIngestResult>;
  bulkIngest(workspaceId: string): Promise<NotionIngestResult>;
};

const SUPPORTED_NOTION_MODELS = [
  "NotionDatabase",
  "NotionPage",
  "NotionContentMetadata",
] as const satisfies readonly NotionSupportedModel[];

const SUPPORTED_MODEL_SET = new Set<string>(SUPPORTED_NOTION_MODELS);

export type NotionIngestErrorEntry = {
  recordId: string;
  model: NotionSupportedModel;
  action: NotionRecordAction;
  error: string;
};

export type HandleNotionSyncNotificationInput = {
  workspaceId: string;
  connectionId: string;
  providerConfigKey: string;
  syncName: string;
  model: NotionSupportedModel;
  modifiedAfter: string;
  adapter: NotionIngestAdapter;
  recordsClient: typeof fetchNangoRecords;
  nangoBaseUrl: string;
  nangoSecretKey: string;
  signal?: AbortSignal;
};

export type HandleNotionSyncNotificationResult = {
  written: number;
  deletesDropped: number;
  errorCount: number;
  errors: NotionIngestErrorEntry[];
  durationMs: number;
};

export type HandleNotionBulkIngestInput = {
  workspaceId: string;
  connectionId: string;
  providerConfigKey: string;
  adapter: NotionIngestAdapter;
  signal?: AbortSignal;
};

export type HandleNotionBulkIngestResult = {
  filesWritten: number;
  errorCount: number;
  errors: NotionIngestErrorEntry[];
  durationMs: number;
};

type AdapterIngestError = NotionIngestResult["errors"][number];

function durationSince(startedAt: number): number {
  return Date.now() - startedAt;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSupportedModel(value: string): value is NotionSupportedModel {
  return SUPPORTED_MODEL_SET.has(value);
}

function readRecordId(record: unknown): string {
  if (!isObject(record)) {
    return "";
  }

  const id = record.id;
  return typeof id === "string" || typeof id === "number" ? String(id) : "";
}

function normalizeAction(value: unknown): NotionRecordAction | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.toUpperCase();
  return normalized === "ADDED" ||
    normalized === "UPDATED" ||
    normalized === "DELETED"
    ? normalized
    : null;
}

function readRecordAction(record: unknown): NotionRecordAction | null {
  if (!isObject(record) || !isObject(record._nango_metadata)) {
    return null;
  }

  return normalizeAction(record._nango_metadata.last_action);
}

function withNormalizedAction(record: unknown): unknown {
  if (!isObject(record) || !isObject(record._nango_metadata)) {
    return record;
  }

  const action = normalizeAction(record._nango_metadata.last_action);
  if (!action) {
    return record;
  }

  return {
    ...record,
    _nango_metadata: {
      ...record._nango_metadata,
      last_action: action,
    },
  };
}

function unsupportedModelError(model: string): NotionIngestErrorEntry {
  return {
    recordId: "",
    model: model as NotionSupportedModel,
    action: "ADDED",
    error: "unsupported_model",
  };
}

function buildErrorEntry(
  record: unknown,
  model: NotionSupportedModel,
  action: NotionRecordAction,
  error: unknown,
): NotionIngestErrorEntry {
  return {
    recordId: readRecordId(record),
    model,
    action,
    error: errorMessage(error),
  };
}

function mapAdapterErrors(
  errors: AdapterIngestError[],
  model: NotionSupportedModel,
  action: NotionRecordAction,
): NotionIngestErrorEntry[] {
  return errors.map((error) => ({
    recordId: error.path,
    model,
    action,
    error: error.error,
  }));
}

function auditSync(
  input: HandleNotionSyncNotificationInput,
  result: HandleNotionSyncNotificationResult,
  outcome: NotionIngestOutcome,
): void {
  recordNotionIngest({
    workspaceId: input.workspaceId,
    connectionId: input.connectionId,
    providerConfigKey: input.providerConfigKey,
    trigger: "sync",
    syncName: input.syncName,
    model: input.model,
    filesWritten: result.written,
    deletesDropped: result.deletesDropped,
    errorCount: result.errorCount,
    durationMs: result.durationMs,
    outcome,
  });
}

function auditBulk(
  input: HandleNotionBulkIngestInput,
  result: HandleNotionBulkIngestResult,
  outcome: NotionIngestOutcome,
): void {
  recordNotionIngest({
    workspaceId: input.workspaceId,
    connectionId: input.connectionId,
    providerConfigKey: input.providerConfigKey,
    trigger: "auth-creation",
    filesWritten: result.filesWritten,
    deletesDropped: 0,
    errorCount: result.errorCount,
    durationMs: result.durationMs,
    outcome,
  });
}

async function ingestParsedRecord(
  input: HandleNotionSyncNotificationInput,
  parsed: DiscriminatedNotionRecord,
): Promise<NotionIngestResult> {
  switch (parsed.model) {
    case "NotionDatabase":
      return input.adapter.ingestDatabase(input.workspaceId, parsed.record.id);
    case "NotionPage": {
      const databaseId =
        parsed.record.parent_type === "database"
          ? parsed.record.parent_id
          : undefined;
      return input.adapter.ingestPage(
        input.workspaceId,
        parsed.record.id,
        databaseId,
      );
    }
    case "NotionContentMetadata":
      if (parsed.record.type === "database") {
        return input.adapter.ingestDatabase(input.workspaceId, parsed.record.id);
      }

      return input.adapter.ingestPage(
        input.workspaceId,
        parsed.record.id,
        undefined,
      );
  }
}

export async function handleNotionSyncNotification(
  input: HandleNotionSyncNotificationInput,
): Promise<HandleNotionSyncNotificationResult> {
  const startedAt = Date.now();
  const model = input.model as string;

  if (!isSupportedModel(model)) {
    const result: HandleNotionSyncNotificationResult = {
      written: 0,
      deletesDropped: 0,
      errorCount: 1,
      errors: [unsupportedModelError(model)],
      durationMs: durationSince(startedAt),
    };
    auditSync(input, result, "unsupported_model");
    return result;
  }

  const errors: NotionIngestErrorEntry[] = [];
  let written = 0;
  let deletesDropped = 0;

  try {
    for await (const rawRecord of input.recordsClient({
      connectionId: input.connectionId,
      providerConfigKey: input.providerConfigKey,
      model,
      syncName: input.syncName,
      modifiedAfter: input.modifiedAfter,
      nangoBaseUrl: input.nangoBaseUrl,
      nangoSecretKey: input.nangoSecretKey,
      ...(input.signal ? { signal: input.signal } : {}),
    })) {
      const action = readRecordAction(rawRecord);
      if (!action) {
        errors.push(
          buildErrorEntry(
            rawRecord,
            input.model,
            "ADDED",
            "invalid_nango_record_action",
          ),
        );
        continue;
      }

      if (action === "DELETED") {
        deletesDropped += 1;
        continue;
      }

      try {
        const parsed = DiscriminatedNotionRecordSchema.safeParse({
          model,
          record: withNormalizedAction(rawRecord),
        });

        if (!parsed.success) {
          throw new Error(parsed.error.message);
        }

        const ingestResult = await ingestParsedRecord(input, parsed.data);
        written += 1;

        if (ingestResult.errors.length > 0) {
          errors.push(
            ...mapAdapterErrors(ingestResult.errors, input.model, action),
          );
        }
      } catch (error) {
        errors.push(buildErrorEntry(rawRecord, input.model, action, error));
      }
    }
  } catch (error) {
    const result: HandleNotionSyncNotificationResult = {
      written,
      deletesDropped,
      errorCount: errors.length + 1,
      errors: [
        ...errors,
        {
          recordId: "",
          model: input.model,
          action: "ADDED",
          error: errorMessage(error),
        },
      ],
      durationMs: durationSince(startedAt),
    };
    auditSync(input, result, "handler_failed");
    throw error;
  }

  const result: HandleNotionSyncNotificationResult = {
    written,
    deletesDropped,
    errorCount: errors.length,
    errors,
    durationMs: durationSince(startedAt),
  };
  auditSync(input, result, errors.length > 0 ? "partial" : "ok");
  return result;
}

export async function handleNotionBulkIngest(
  input: HandleNotionBulkIngestInput,
): Promise<HandleNotionBulkIngestResult> {
  const startedAt = Date.now();

  try {
    const ingestResult = await input.adapter.bulkIngest(input.workspaceId);
    const errors = mapAdapterErrors(
      ingestResult.errors,
      "NotionContentMetadata",
      "ADDED",
    );
    const result: HandleNotionBulkIngestResult = {
      filesWritten: ingestResult.filesWritten,
      errorCount: errors.length,
      errors,
      durationMs: durationSince(startedAt),
    };
    auditBulk(input, result, errors.length > 0 ? "partial" : "ok");
    return result;
  } catch (error) {
    const errors: NotionIngestErrorEntry[] = [
      {
        recordId: "",
        model: "NotionContentMetadata",
        action: "ADDED",
        error: errorMessage(error),
      },
    ];
    const result: HandleNotionBulkIngestResult = {
      filesWritten: 0,
      errorCount: errors.length,
      errors,
      durationMs: durationSince(startedAt),
    };
    auditBulk(input, result, "handler_failed");
    throw error;
  }
}
