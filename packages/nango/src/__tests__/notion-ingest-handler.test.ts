import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  handleNotionBulkIngest,
  handleNotionSyncNotification,
  type NotionIngestAdapter,
  type NotionIngestResult,
} from "../notion-ingest-handler.js";
import type { NotionSupportedModel } from "../notion-ingest-schema.js";
import type {
  FetchNangoRecordsArgs,
  NangoRecord,
  fetchNangoRecords,
} from "../notion-records-client.js";

const WORKSPACE_ID = "workspace_123";
const CONNECTION_ID = "conn_notion_test_001";
const PROVIDER_CONFIG_KEY = "notion";
const MODIFIED_AFTER = "2026-04-15T18:00:00.000Z";

type FixtureRecord = Record<string, unknown> & {
  id: string;
  _nango_metadata: {
    last_action: "ADDED" | "UPDATED" | "DELETED" | "added" | "updated" | "deleted";
  };
};

type AdapterCall = {
  method: "ingestPage" | "ingestDatabase" | "bulkIngest";
  workspaceId: string;
  id?: string;
  databaseId?: string;
};

const FIXTURE_RECORDS: FixtureRecord[] = [
  {
    id: "db_fixture_001",
    title: "Roadmap",
    url: "https://notion.example/db_fixture_001",
    description: "Database description",
    properties: ["Name", "Status"],
    last_edited_time: "2026-04-15T18:00:00.000Z",
    _nango_metadata: { last_action: "ADDED" },
  },
  {
    id: "page_fixture_001",
    title: "Q2 Planning",
    url: "https://notion.example/page_fixture_001",
    parent_type: "database",
    parent_id: "db_fixture_001",
    last_edited_time: "2026-04-15T18:05:00.000Z",
    content_preview: "Planning notes",
    _nango_metadata: { last_action: "updated" },
  },
  {
    id: "page_fixture_002",
    title: "Standalone",
    url: "https://notion.example/page_fixture_002",
    parent_type: "workspace",
    parent_id: "workspace_root",
    last_edited_time: "2026-04-15T18:06:00.000Z",
    content_preview: "Standalone notes",
    _nango_metadata: { last_action: "ADDED" },
  },
  {
    id: "page_fixture_deleted",
    title: "Old Doc",
    url: "https://notion.example/page_fixture_deleted",
    parent_type: "workspace",
    parent_id: "workspace_root",
    last_edited_time: "2026-04-15T17:00:00.000Z",
    content_preview: "Old notes",
    _nango_metadata: { last_action: "DELETED" },
  },
  {
    id: "meta_fixture_001",
    path: "/notion/pages/meta_fixture_001.md",
    type: "page",
    last_modified: "2026-04-15T18:07:00.000Z",
    title: "Metadata",
    parent_id: "workspace_root",
    _nango_metadata: { last_action: "ADDED" },
  },
];

function modelForRecord(record: FixtureRecord): NotionSupportedModel {
  if (Array.isArray(record.properties)) {
    return "NotionDatabase";
  }

  if (typeof record.content_preview === "string") {
    return "NotionPage";
  }

  return "NotionContentMetadata";
}

function recordsForModel(
  records: FixtureRecord[],
  model: NotionSupportedModel,
): FixtureRecord[] {
  return records.filter((record) => modelForRecord(record) === model);
}

function createRecordsClient(records: FixtureRecord[]): typeof fetchNangoRecords {
  return (async function* recordsClient(
    _input: FetchNangoRecordsArgs,
  ): AsyncGenerator<NangoRecord> {
    for (const record of records) {
      yield record as NangoRecord;
    }
  }) as typeof fetchNangoRecords;
}

function createIngestResult(path: string): NotionIngestResult {
  return {
    filesWritten: 1,
    filesUpdated: 0,
    filesDeleted: 0,
    paths: [path],
    errors: [],
  };
}

function createAdapterStub(options: {
  throwOnRecordId?: string;
  bulkReject?: Error;
  bulkErrors?: NotionIngestResult["errors"];
} = {}): {
  adapter: NotionIngestAdapter;
  calls: AdapterCall[];
  bulkCalls: string[];
} {
  const calls: AdapterCall[] = [];
  const bulkCalls: string[] = [];

  return {
    calls,
    bulkCalls,
    adapter: {
      async ingestPage(
        workspaceId: string,
        pageId: string,
        databaseId?: string,
      ): Promise<NotionIngestResult> {
        calls.push({
          method: "ingestPage",
          workspaceId,
          id: pageId,
          ...(databaseId ? { databaseId } : {}),
        });
        if (options.throwOnRecordId === pageId) {
          throw new Error(`adapter failed for ${pageId}`);
        }

        const path = databaseId
          ? `/notion/databases/${databaseId}/pages/${pageId}.json`
          : `/notion/pages/${pageId}.json`;
        return createIngestResult(path);
      },
      async ingestDatabase(
        workspaceId: string,
        databaseId: string,
      ): Promise<NotionIngestResult> {
        calls.push({ method: "ingestDatabase", workspaceId, id: databaseId });
        if (options.throwOnRecordId === databaseId) {
          throw new Error(`adapter failed for ${databaseId}`);
        }

        return createIngestResult(`/notion/databases/${databaseId}.json`);
      },
      async bulkIngest(workspaceId: string): Promise<NotionIngestResult> {
        calls.push({ method: "bulkIngest", workspaceId });
        bulkCalls.push(workspaceId);
        if (options.bulkReject) {
          throw options.bulkReject;
        }

        return {
          filesWritten: options.bulkErrors?.length ? 40 : 42,
          filesUpdated: 0,
          filesDeleted: 0,
          paths: ["/notion/pages/page_fixture_001.json"],
          errors: options.bulkErrors ?? [],
        };
      },
    },
  };
}

function createSyncInput(input: {
  adapter: NotionIngestAdapter;
  records: FixtureRecord[];
  model: NotionSupportedModel;
}) {
  return {
    workspaceId: WORKSPACE_ID,
    connectionId: CONNECTION_ID,
    providerConfigKey: PROVIDER_CONFIG_KEY,
    syncName: "notion-pages",
    model: input.model,
    modifiedAfter: MODIFIED_AFTER,
    adapter: input.adapter,
    recordsClient: createRecordsClient(input.records),
    nangoBaseUrl: "http://127.0.0.1:1",
    nangoSecretKey: "test-nango-secret",
  };
}

function captureConsoleOutput(): { restore: () => void } {
  const originalInfo = console.info;
  const originalWarn = console.warn;

  console.info = (() => undefined) as typeof console.info;
  console.warn = (() => undefined) as typeof console.warn;

  return {
    restore: () => {
      console.info = originalInfo;
      console.warn = originalWarn;
    },
  };
}

describe("handleNotionSyncNotification", () => {
  it("writes all supported models from a records batch", async () => {
    const { adapter, calls } = createAdapterStub();
    const capture = captureConsoleOutput();

    try {
      const results = [];
      for (const model of [
        "NotionDatabase",
        "NotionPage",
        "NotionContentMetadata",
      ] as const) {
        results.push(
          await handleNotionSyncNotification(
            createSyncInput({
              adapter,
              records: recordsForModel(FIXTURE_RECORDS, model),
              model,
            }),
          ),
        );
      }

      assert.equal(results.reduce((sum, result) => sum + result.written, 0), 4);
      assert.equal(
        results.reduce((sum, result) => sum + result.deletesDropped, 0),
        1,
      );
      assert.deepEqual(
        calls.map((call) => `${call.method}:${call.id}:${call.databaseId ?? ""}`),
        [
          "ingestDatabase:db_fixture_001:",
          "ingestPage:page_fixture_001:db_fixture_001",
          "ingestPage:page_fixture_002:",
          "ingestPage:meta_fixture_001:",
        ],
      );
    } finally {
      capture.restore();
    }
  });

  it("drops DELETED records without calling the adapter", async () => {
    const { adapter, calls } = createAdapterStub();
    const capture = captureConsoleOutput();

    try {
      const result = await handleNotionSyncNotification(
        createSyncInput({
          adapter,
          records: recordsForModel(FIXTURE_RECORDS, "NotionPage"),
          model: "NotionPage",
        }),
      );

      assert.equal(result.deletesDropped, 1);
      assert.equal(result.errorCount, 0);
      assert.equal(calls.some((call) => call.id === "page_fixture_deleted"), false);
    } finally {
      capture.restore();
    }
  });

  it("adapter exception on one record does not abort the rest", async () => {
    const { adapter, calls } = createAdapterStub({
      throwOnRecordId: "page_fixture_001",
    });
    const capture = captureConsoleOutput();

    try {
      const result = await handleNotionSyncNotification(
        createSyncInput({
          adapter,
          records: recordsForModel(FIXTURE_RECORDS, "NotionPage"),
          model: "NotionPage",
        }),
      );

      assert.equal(result.written, 1);
      assert.equal(result.deletesDropped, 1);
      assert.equal(result.errorCount, 1);
      assert.match(result.errors[0]?.error ?? "", /adapter failed/);
      assert.deepEqual(
        calls.map((call) => call.id),
        ["page_fixture_001", "page_fixture_002"],
      );
    } finally {
      capture.restore();
    }
  });

  it("returns unsupported_model for unsupported sync models", async () => {
    const { adapter } = createAdapterStub();
    const capture = captureConsoleOutput();

    try {
      const result = await handleNotionSyncNotification(
        createSyncInput({
          adapter,
          records: [],
          model: "NotionComment" as NotionSupportedModel,
        }),
      );

      assert.equal(result.written, 0);
      assert.equal(result.errorCount, 1);
      assert.equal(result.errors[0]?.error, "unsupported_model");
    } finally {
      capture.restore();
    }
  });
});

describe("handleNotionBulkIngest", () => {
  it("calls adapter.bulkIngest with the workspaceId", async () => {
    const { adapter, bulkCalls } = createAdapterStub();
    const capture = captureConsoleOutput();

    try {
      const result = await handleNotionBulkIngest({
        workspaceId: WORKSPACE_ID,
        connectionId: CONNECTION_ID,
        providerConfigKey: PROVIDER_CONFIG_KEY,
        adapter,
      });

      assert.deepEqual(bulkCalls, [WORKSPACE_ID]);
      assert.equal(result.filesWritten, 42);
      assert.equal(result.errorCount, 0);
    } finally {
      capture.restore();
    }
  });

  it("throws adapter bulk failures after recording an audit entry", async () => {
    const { adapter } = createAdapterStub({
      bulkReject: new Error("bulk ingest failed"),
    });
    const capture = captureConsoleOutput();

    try {
      await assert.rejects(
        handleNotionBulkIngest({
          workspaceId: WORKSPACE_ID,
          connectionId: CONNECTION_ID,
          providerConfigKey: PROVIDER_CONFIG_KEY,
          adapter,
        }),
        /bulk ingest failed/,
      );
    } finally {
      capture.restore();
    }
  });
});
