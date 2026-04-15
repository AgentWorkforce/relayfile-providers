export type NotionIngestTrigger = "sync" | "auth-creation";

export type NotionIngestOutcome =
  | "ok"
  | "partial"
  | "unsupported_model"
  | "workspace_unresolved"
  | "invalid_envelope"
  | "handler_failed";

export interface NotionIngestAuditEntry {
  workspaceId: string;
  connectionId: string;
  providerConfigKey: string;
  trigger: NotionIngestTrigger;
  syncName?: string;
  model?: string;
  filesWritten: number;
  deletesDropped: number;
  errorCount: number;
  durationMs: number;
  outcome: NotionIngestOutcome;
}

export type NotionIngestAuditContext = {
  area: "notion-ingest";
  workspaceId: string;
  connectionId: string;
  providerConfigKey: string;
  trigger: NotionIngestTrigger;
  syncName?: string;
  model?: string;
  filesWritten: number;
  deletesDropped: number;
  errorCount: number;
  durationMs: number;
  outcome: NotionIngestOutcome;
};

export function buildNotionIngestAuditContext(
  entry: NotionIngestAuditEntry,
): NotionIngestAuditContext {
  const {
    workspaceId,
    connectionId,
    providerConfigKey,
    trigger,
    syncName,
    model,
    filesWritten,
    deletesDropped,
    errorCount,
    durationMs,
    outcome,
  } = entry;

  return {
    area: "notion-ingest",
    workspaceId,
    connectionId,
    providerConfigKey,
    trigger,
    ...(syncName ? { syncName } : {}),
    ...(model ? { model } : {}),
    filesWritten,
    deletesDropped,
    errorCount,
    durationMs,
    outcome,
  };
}

export function recordNotionIngest(entry: NotionIngestAuditEntry): void {
  const context = buildNotionIngestAuditContext(entry);

  if (entry.outcome === "ok") {
    console.info("Notion ingest completed", context);
    return;
  }

  console.warn("Notion ingest failed", context);
}
