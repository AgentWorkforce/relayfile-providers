import type { RelayFileClient } from "@relayfile/sdk";

export interface MockFetchResponseInit {
  body?: unknown;
  headers?: Record<string, string>;
  status?: number;
}

export function jsonResponse(init: MockFetchResponseInit = {}): Response {
  return new Response(
    init.body === undefined ? null : JSON.stringify(init.body),
    {
      status: init.status ?? 200,
      headers: {
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
    }
  );
}

export function createRelayFileClientMock(): RelayFileClient {
  return {
    ingestWebhook: async () => ({
      id: "queued_1",
      status: "queued",
    }),
  } as unknown as RelayFileClient;
}
