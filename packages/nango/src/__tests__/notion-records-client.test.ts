import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fetchNangoRecords,
  type FetchNangoRecordsArgs,
  type NangoRecord,
} from "../notion-records-client.js";

const SECRET = "test-nango-secret";
const CONNECTION_ID = "conn_notion_test_001";
const PROVIDER_CONFIG_KEY = "notion";
const MODIFIED_AFTER = "2026-04-15T18:00:00.000Z";

function createInput(
  overrides: Partial<FetchNangoRecordsArgs> = {},
): FetchNangoRecordsArgs {
  return {
    nangoBaseUrl: "http://127.0.0.1:1",
    nangoSecretKey: SECRET,
    connectionId: CONNECTION_ID,
    providerConfigKey: PROVIDER_CONFIG_KEY,
    model: "NotionPage",
    syncName: "notion-pages",
    modifiedAfter: MODIFIED_AFTER,
    pageSize: 2,
    sleepImpl: async () => undefined,
    ...overrides,
  };
}

function response(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function collectRecords<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const records: T[] = [];
  for await (const record of iterable) {
    records.push(record);
  }

  return records;
}

function createRecord(id: string): NangoRecord {
  return {
    id,
    _nango_metadata: {
      last_action: "ADDED",
    },
  };
}

function captureConsoleOutput(): {
  output: () => string;
  restore: () => void;
} {
  const originalLog = console.log;
  const originalInfo = console.info;
  const originalWarn = console.warn;
  const originalError = console.error;
  const lines: string[] = [];
  const capture = (...args: unknown[]) => {
    lines.push(
      args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "),
    );
  };

  console.log = capture as typeof console.log;
  console.info = capture as typeof console.info;
  console.warn = capture as typeof console.warn;
  console.error = capture as typeof console.error;

  return {
    output: () => lines.join("\n"),
    restore: () => {
      console.log = originalLog;
      console.info = originalInfo;
      console.warn = originalWarn;
      console.error = originalError;
    },
  };
}

describe("fetchNangoRecords", () => {
  it("paginates via next_cursor until null", async () => {
    const requestedCursors: Array<string | null> = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      assert.equal(init?.method, "GET");
      const parsed = new URL(String(url));
      const cursor = parsed.searchParams.get("cursor");
      requestedCursors.push(cursor);

      if (!cursor) {
        return response(200, {
          records: [createRecord("page_fixture_001")],
          next_cursor: "cursor_page_1",
        });
      }

      return response(200, {
        records: [createRecord("page_fixture_002")],
        next_cursor: null,
      });
    };

    const records = await collectRecords(
      fetchNangoRecords(createInput({ fetchImpl })),
    );

    assert.deepEqual(
      records.map((record) => record.id),
      ["page_fixture_001", "page_fixture_002"],
    );
    assert.deepEqual(requestedCursors, [null, "cursor_page_1"]);
  });

  it("sets auth headers and records query params", async () => {
    const requests: Array<{
      authorization: string | null;
      connectionId: string | null;
      providerConfigKey: string | null;
      model: string | null;
      syncName: string | null;
      modifiedAfter: string | null;
      limit: string | null;
      connectionHeader: string | null;
      providerHeader: string | null;
    }> = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      const parsed = new URL(String(url));
      const headers = new Headers(init?.headers);
      requests.push({
        authorization: headers.get("authorization"),
        connectionId: parsed.searchParams.get("connection_id"),
        providerConfigKey: parsed.searchParams.get("provider_config_key"),
        model: parsed.searchParams.get("model"),
        syncName: parsed.searchParams.get("sync_name"),
        modifiedAfter: parsed.searchParams.get("modified_after"),
        limit: parsed.searchParams.get("limit"),
        connectionHeader: headers.get("connection-id"),
        providerHeader: headers.get("provider-config-key"),
      });

      return response(200, { records: [], next_cursor: null });
    };

    await collectRecords(
      fetchNangoRecords(
        createInput({
          fetchImpl,
          model: "NotionContentMetadata",
          syncName: "notion-content-metadata",
          modifiedAfter: "2026-04-15T19:00:00.000Z",
        }),
      ),
    );

    assert.deepEqual(requests, [
      {
        authorization: `Bearer ${SECRET}`,
        connectionId: CONNECTION_ID,
        providerConfigKey: PROVIDER_CONFIG_KEY,
        model: "NotionContentMetadata",
        syncName: "notion-content-metadata",
        modifiedAfter: "2026-04-15T19:00:00.000Z",
        limit: "2",
        connectionHeader: CONNECTION_ID,
        providerHeader: PROVIDER_CONFIG_KEY,
      },
    ]);
  });

  it("retries on 5xx and does not retry on 4xx", async () => {
    const delays: number[] = [];
    let attempts = 0;
    const retryingFetch: typeof fetch = async () => {
      attempts += 1;
      return attempts < 3
        ? response(503, { error: "forced_503" })
        : response(200, { records: [createRecord("ok")], next_cursor: null });
    };

    const records = await collectRecords(
      fetchNangoRecords(
        createInput({
          fetchImpl: retryingFetch,
          sleepImpl: async (ms) => {
            delays.push(ms);
          },
        }),
      ),
    );

    assert.equal(attempts, 3);
    assert.deepEqual(delays, [250, 500]);
    assert.deepEqual(records.map((record) => record.id), ["ok"]);

    attempts = 0;
    await assert.rejects(
      collectRecords(
        fetchNangoRecords(
          createInput({
            fetchImpl: async () => {
              attempts += 1;
              return response(404, { error: "not_found" });
            },
          }),
        ),
      ),
      /not_found|404|records/i,
    );
    assert.equal(attempts, 1);
  });

  it("never logs records or Authorization", async () => {
    const capture = captureConsoleOutput();

    try {
      await collectRecords(
        fetchNangoRecords(
          createInput({
            fetchImpl: async () =>
              response(200, {
                records: [createRecord("db_fixture_001")],
                next_cursor: null,
              }),
          }),
        ),
      );

      const output = capture.output();
      assert.equal(output.includes("Bearer "), false);
      assert.equal(output.includes("Authorization"), false);
      assert.equal(output.includes("db_fixture_001"), false);
    } finally {
      capture.restore();
    }
  });

  it("propagates AbortSignal", async () => {
    const controller = new AbortController();
    controller.abort(new DOMException("manual abort", "AbortError"));

    await assert.rejects(
      collectRecords(fetchNangoRecords(createInput({ signal: controller.signal }))),
      /abort/i,
    );
  });
});
