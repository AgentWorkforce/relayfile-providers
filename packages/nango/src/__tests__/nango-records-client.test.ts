import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fetchNangoRecords,
  type FetchNangoRecordsArgs,
  type NangoListRecordsClient,
  type NangoRecord,
} from "../nango-records-client.js";

const SECRET = "test-nango-secret";
const CONNECTION_ID = "conn_notion_test_001";
const PROVIDER_CONFIG_KEY = "notion";
const MODIFIED_AFTER = "2026-04-15T18:00:00.000Z";

function createRecord(id: string): NangoRecord {
  return {
    id,
    _nango_metadata: {
      last_action: "ADDED",
    },
  };
}

/** Minimal mock that records calls and returns canned pages. */
function createMockClient(
  pages: Array<{ records: NangoRecord[]; next_cursor: string | null }>,
): { client: NangoListRecordsClient; calls: Array<Record<string, unknown>> } {
  const calls: Array<Record<string, unknown>> = [];
  let pageIndex = 0;

  const client = {
    async listRecords(config: Record<string, unknown>) {
      calls.push({ ...config });
      const page = pages[pageIndex] ?? { records: [], next_cursor: null };
      pageIndex += 1;
      return page;
    },
  } as unknown as NangoListRecordsClient;

  return { client, calls };
}

function createInput(
  overrides: Partial<FetchNangoRecordsArgs> = {},
): FetchNangoRecordsArgs {
  return {
    nangoBaseUrl: "https://api.nango.dev",
    nangoSecretKey: SECRET,
    connectionId: CONNECTION_ID,
    providerConfigKey: PROVIDER_CONFIG_KEY,
    model: "NotionPage",
    syncName: "notion-pages",
    modifiedAfter: MODIFIED_AFTER,
    pageSize: 2,
    ...overrides,
  };
}

async function collectRecords<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const records: T[] = [];
  for await (const record of iterable) {
    records.push(record);
  }
  return records;
}

describe("fetchNangoRecords", () => {
  it("paginates via next_cursor until null", async () => {
    const { client, calls } = createMockClient([
      { records: [createRecord("page_fixture_001")], next_cursor: "cursor_page_1" },
      { records: [createRecord("page_fixture_002")], next_cursor: null },
    ]);

    const records = await collectRecords(
      fetchNangoRecords(createInput({ nangoClient: client })),
    );

    assert.deepEqual(
      records.map((record) => record.id),
      ["page_fixture_001", "page_fixture_002"],
    );
    assert.equal(calls.length, 2);
    assert.equal(calls[0]?.cursor, undefined);
    assert.equal(calls[1]?.cursor, "cursor_page_1");
  });

  it("passes correct config to Nango SDK listRecords", async () => {
    const { client, calls } = createMockClient([
      { records: [], next_cursor: null },
    ]);

    await collectRecords(
      fetchNangoRecords(
        createInput({
          nangoClient: client,
          model: "NotionContentMetadata",
          modifiedAfter: "2026-04-15T19:00:00.000Z",
        }),
      ),
    );

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
      providerConfigKey: PROVIDER_CONFIG_KEY,
      connectionId: CONNECTION_ID,
      model: "NotionContentMetadata",
      modifiedAfter: "2026-04-15T19:00:00.000Z",
      limit: 2,
    });
  });

  it("handles errors from Nango SDK", async () => {
    const client: NangoListRecordsClient = {
      async listRecords() {
        throw new Error("Nango API error: 400 Bad Request");
      },
    };

    await assert.rejects(
      collectRecords(
        fetchNangoRecords(createInput({ nangoClient: client })),
      ),
      /Nango API error|400/i,
    );
  });

  it("propagates AbortSignal", async () => {
    const controller = new AbortController();
    controller.abort(new DOMException("manual abort", "AbortError"));

    const { client } = createMockClient([
      { records: [createRecord("should_not_appear")], next_cursor: null },
    ]);

    await assert.rejects(
      collectRecords(
        fetchNangoRecords(createInput({ nangoClient: client, signal: controller.signal })),
      ),
      /abort/i,
    );
  });

  it("omits modifiedAfter when empty", async () => {
    const { client, calls } = createMockClient([
      { records: [], next_cursor: null },
    ]);

    await collectRecords(
      fetchNangoRecords(
        createInput({ nangoClient: client, modifiedAfter: "" }),
      ),
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.modifiedAfter, undefined);
  });
});
