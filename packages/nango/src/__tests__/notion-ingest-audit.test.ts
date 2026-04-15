import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildNotionIngestAuditContext,
  recordNotionIngest,
  type NotionIngestAuditEntry,
} from "../notion-ingest-audit.js";

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends <
  T,
>() => T extends Y ? 1 : 2
  ? true
  : false;
type Expect<T extends true> = T;
type AllowedAuditFields =
  | "workspaceId"
  | "connectionId"
  | "providerConfigKey"
  | "trigger"
  | "syncName"
  | "model"
  | "filesWritten"
  | "deletesDropped"
  | "errorCount"
  | "durationMs"
  | "outcome";
type ForbiddenAuditFields =
  | "records"
  | "content"
  | "properties"
  | "payload"
  | "title"
  | "body";
type _AuditEntryKeysAreExact = Expect<
  Equal<keyof NotionIngestAuditEntry, AllowedAuditFields>
>;
type _AuditEntryHasNoForbiddenFields = Expect<
  Extract<keyof NotionIngestAuditEntry, ForbiddenAuditFields> extends never
    ? true
    : false
>;

const FORBIDDEN_FIELDS: ForbiddenAuditFields[] = [
  "records",
  "content",
  "properties",
  "payload",
  "title",
  "body",
];

function createAuditEntry(
  overrides: Partial<NotionIngestAuditEntry> = {},
): NotionIngestAuditEntry {
  return {
    workspaceId: "workspace_123",
    connectionId: "conn_notion_123",
    providerConfigKey: "notion",
    trigger: "sync",
    syncName: "notion-pages",
    model: "NotionPage",
    filesWritten: 4,
    deletesDropped: 1,
    errorCount: 0,
    durationMs: 12,
    outcome: "ok",
    ...overrides,
  };
}

function captureConsoleOutput(): {
  calls: Array<{ level: "info" | "warn"; args: unknown[] }>;
  output: () => string;
  restore: () => void;
} {
  const originalInfo = console.info;
  const originalWarn = console.warn;
  const calls: Array<{ level: "info" | "warn"; args: unknown[] }> = [];
  const serialize = (args: unknown[]) =>
    args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" ");

  console.info = ((...args: unknown[]) => {
    calls.push({ level: "info", args });
  }) as typeof console.info;
  console.warn = ((...args: unknown[]) => {
    calls.push({ level: "warn", args });
  }) as typeof console.warn;

  return {
    calls,
    output: () => calls.map((call) => serialize(call.args)).join("\n"),
    restore: () => {
      console.info = originalInfo;
      console.warn = originalWarn;
    },
  };
}

describe("NotionIngestAuditEntry", () => {
  it("has allowed fields only", () => {
    const entry = createAuditEntry();

    assert.deepEqual(Object.keys(entry).sort(), [
      "connectionId",
      "deletesDropped",
      "durationMs",
      "errorCount",
      "filesWritten",
      "model",
      "outcome",
      "providerConfigKey",
      "syncName",
      "trigger",
      "workspaceId",
    ]);
  });

  it("does not expose forbidden fields", () => {
    const entry = createAuditEntry();
    for (const field of FORBIDDEN_FIELDS) {
      assert.equal(Object.hasOwn(entry, field), false);
    }
  });
});

describe("recordNotionIngest", () => {
  it("emits a serializable audit context", () => {
    const capture = captureConsoleOutput();

    try {
      recordNotionIngest(createAuditEntry());

      assert.equal(capture.calls.length, 1);
      assert.equal(capture.calls[0]?.level, "info");
      assert.equal(capture.calls[0]?.args[0], "Notion ingest completed");
      assert.deepEqual(capture.calls[0]?.args[1], {
        area: "notion-ingest",
        workspaceId: "workspace_123",
        connectionId: "conn_notion_123",
        providerConfigKey: "notion",
        trigger: "sync",
        syncName: "notion-pages",
        model: "NotionPage",
        filesWritten: 4,
        deletesDropped: 1,
        errorCount: 0,
        durationMs: 12,
        outcome: "ok",
      });
      assert.doesNotThrow(() => JSON.stringify(capture.calls[0]?.args[1]));
    } finally {
      capture.restore();
    }
  });

  it("uses warn for non-ok outcomes", () => {
    const capture = captureConsoleOutput();

    try {
      recordNotionIngest(createAuditEntry({ outcome: "partial", errorCount: 1 }));

      assert.equal(capture.calls.length, 1);
      assert.equal(capture.calls[0]?.level, "warn");
      assert.equal(capture.calls[0]?.args[0], "Notion ingest failed");
    } finally {
      capture.restore();
    }
  });

  it("omits optional sync fields when absent", () => {
    const entry = createAuditEntry({ trigger: "auth-creation" });
    delete entry.syncName;
    delete entry.model;

    const context = buildNotionIngestAuditContext(entry);

    assert.equal(Object.hasOwn(context, "syncName"), false);
    assert.equal(Object.hasOwn(context, "model"), false);
  });
});
