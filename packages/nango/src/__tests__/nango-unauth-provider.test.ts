import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createNangoUnauthProvider,
  type NangoUnauthCredentials,
} from "../nango-unauth-provider.js";
import type { ProxyRequest } from "../types.js";

describe("NangoUnauthProvider", () => {
  it("reads credential headers from metadataKey during proxy()", async () => {
    const fetchMock = createFetchMock([
      jsonResponse({
        connection: {
          id: "conn_123",
          provider: "github",
          provider_config_key: "github",
          active: true,
          metadata: {
            privateAuth: {
              headers: {
                authorization: "Bearer stored-token",
                "x-api-key": "stored-api-key",
                "x-ignored-number": 123,
              },
            },
          },
        },
      }),
      jsonResponse({
        ok: true,
      }),
    ]);
    const provider = createNangoUnauthProvider({
      secretKey: " test-secret ",
      baseUrl: "https://api.nango.test/",
      providerConfigKey: "github",
      metadataKey: "privateAuth",
      fetch: fetchMock.fetch,
    });
    const request: ProxyRequest = {
      method: "GET",
      baseUrl: "https://api.github.com/",
      endpoint: "/user",
      connectionId: "conn_123",
      headers: {
        accept: "application/json",
        "x-existing": "existing-value",
      },
    };

    const response = await provider.proxy<{ ok: boolean }>(request);

    assert.equal(response.status, 200);
    assert.deepEqual(response.data, { ok: true });
    assert.equal(fetchMock.calls.length, 2);

    const connectionCall = getCall(fetchMock.calls, 0);
    assert.equal(
      connectionCall.url,
      "https://api.nango.test/connections/conn_123?provider_config_key=github",
    );
    assert.equal(connectionCall.method, "GET");
    assert.equal(connectionCall.headers.get("authorization"), "Bearer test-secret");

    const proxyCall = getCall(fetchMock.calls, 1);
    assert.equal(proxyCall.url, "https://api.nango.test/proxy");
    assert.equal(proxyCall.method, "POST");
    assert.equal(proxyCall.headers.get("authorization"), "Bearer test-secret");
    assert.equal(proxyCall.headers.get("connection-id"), "conn_123");
    assert.equal(proxyCall.headers.get("provider-config-key"), "github");
    assert.deepEqual(parseJsonBody(proxyCall), {
      method: "GET",
      baseUrlOverride: "https://api.github.com",
      endpoint: "/user",
      headers: {
        accept: "application/json",
        "x-existing": "existing-value",
        authorization: "Bearer stored-token",
        "x-api-key": "stored-api-key",
      },
    });
  });

  it("setConnectionCredentials() updates the metadata payload shape", async () => {
    const fetchMock = createFetchMock([emptyResponse()]);
    const provider = createNangoUnauthProvider({
      secretKey: "test-secret",
      baseUrl: "https://api.nango.test",
      providerConfigKey: "github",
      metadataKey: "privateAuth",
      fetch: fetchMock.fetch,
    });
    const credentials: NangoUnauthCredentials = {
      token: "new-token",
      headers: {
        authorization: "Bearer new-token",
      },
    };

    await provider.setConnectionCredentials(" conn_456 ", credentials);

    assert.equal(fetchMock.calls.length, 1);
    const call = getCall(fetchMock.calls, 0);
    assert.equal(call.url, "https://api.nango.test/connections/metadata");
    assert.equal(call.method, "PATCH");
    assert.equal(call.headers.get("accept"), "application/json");
    assert.equal(call.headers.get("authorization"), "Bearer test-secret");
    assert.equal(call.headers.get("content-type"), "application/json");
    assert.deepEqual(parseJsonBody(call), {
      connection_id: "conn_456",
      provider_config_key: "github",
      metadata: {
        privateAuth: credentials,
      },
    });
  });

  it("refreshConnectionCredentials() persists refreshed credentials", async () => {
    const currentCredentials: NangoUnauthCredentials = {
      token: "old-token",
      headers: {
        authorization: "Bearer old-token",
      },
    };
    const refreshedCredentials: NangoUnauthCredentials = {
      token: "new-token",
      headers: {
        authorization: "Bearer new-token",
      },
    };
    const fetchMock = createFetchMock([
      jsonResponse({
        connection: {
          id: "conn_refresh",
          provider: "github",
          provider_config_key: "github",
          active: true,
          metadata: {
            privateAuth: currentCredentials,
          },
        },
      }),
      emptyResponse(),
    ]);
    const provider = createNangoUnauthProvider({
      secretKey: "test-secret",
      baseUrl: "https://api.nango.test",
      providerConfigKey: "github",
      metadataKey: "privateAuth",
      fetch: fetchMock.fetch,
    });

    const result = await provider.refreshConnectionCredentials(
      "conn_refresh",
      (credentials, context) => {
        assert.deepEqual(credentials, currentCredentials);
        assert.deepEqual(context, {
          connectionId: "conn_refresh",
          metadataKey: "privateAuth",
          providerConfigKey: "github",
        });

        return refreshedCredentials;
      },
    );

    assert.deepEqual(result, refreshedCredentials);
    assert.equal(fetchMock.calls.length, 2);

    const connectionCall = getCall(fetchMock.calls, 0);
    assert.equal(
      connectionCall.url,
      "https://api.nango.test/connections/conn_refresh?provider_config_key=github",
    );
    assert.equal(connectionCall.method, "GET");

    const metadataCall = getCall(fetchMock.calls, 1);
    assert.equal(metadataCall.url, "https://api.nango.test/connections/metadata");
    assert.equal(metadataCall.method, "PATCH");
    assert.deepEqual(parseJsonBody(metadataCall), {
      connection_id: "conn_refresh",
      provider_config_key: "github",
      metadata: {
        privateAuth: refreshedCredentials,
      },
    });
  });

  it("does not leak plaintext credentials in metadata update errors", async () => {
    const plaintextToken = "plain-secret-token";
    const plaintextApiKey = "plain-secret-api-key";
    const credentials: NangoUnauthCredentials = {
      token: plaintextToken,
      headers: {
        authorization: `Bearer ${plaintextToken}`,
        "x-api-key": plaintextApiKey,
      },
    };
    const fetchMock = createFetchMock([
      jsonResponse(
        {
          error: "metadata rejected",
          echoedCredentials: credentials,
        },
        {
          status: 500,
          statusText: "Internal Server Error",
        },
      ),
    ]);
    const provider = createNangoUnauthProvider({
      secretKey: "test-secret",
      baseUrl: "https://api.nango.test",
      providerConfigKey: "github",
      fetch: fetchMock.fetch,
    });

    await assert.rejects(
      provider.setConnectionCredentials("conn_secret", credentials),
      (error: unknown) => {
        assertErrorDoesNotContain(error, [plaintextToken, plaintextApiKey]);
        return true;
      },
    );

    assert.equal(fetchMock.calls.length, 1);
  });
});

interface FetchCall {
  url: string;
  method: string;
  headers: Headers;
  bodyText?: string;
}

interface FetchMock {
  calls: FetchCall[];
  fetch: typeof fetch;
}

interface JsonResponseOptions {
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
}

function createFetchMock(responses: Response[]): FetchMock {
  const queue = [...responses];
  const calls: FetchCall[] = [];

  return {
    calls,
    fetch: async (input, init) => {
      const request = input instanceof Request ? new Request(input, init) : new Request(input, init);
      const bodyText = await request.clone().text();

      calls.push({
        url: request.url,
        method: request.method.toUpperCase(),
        headers: new Headers(request.headers),
        ...(bodyText.length === 0 ? {} : { bodyText }),
      });

      const response = queue.shift();
      if (response === undefined) {
        throw new Error(`No mocked fetch response remains for ${request.method} ${request.url}.`);
      }

      return response;
    },
  };
}

function jsonResponse(body: unknown, options: JsonResponseOptions = {}): Response {
  const init: ResponseInit = {
    status: options.status ?? 200,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
  };

  if (options.statusText !== undefined) {
    init.statusText = options.statusText;
  }

  return new Response(JSON.stringify(body), init);
}

function emptyResponse(): Response {
  return new Response(null, { status: 204 });
}

function getCall(calls: FetchCall[], index: number): FetchCall {
  const call = calls[index];
  assert.ok(call, `Expected fetch call at index ${index}.`);
  return call;
}

function parseJsonBody(call: FetchCall): unknown {
  assert.ok(call.bodyText, "Expected fetch call to include a JSON request body.");
  return JSON.parse(call.bodyText);
}

function assertErrorDoesNotContain(error: unknown, plaintextValues: string[]): asserts error is Error {
  assert.ok(error instanceof Error, "Expected an Error instance.");

  const serializedError = `${error.name}\n${error.message}\n${error.stack ?? ""}`;
  for (const plaintextValue of plaintextValues) {
    assert.equal(
      serializedError.includes(plaintextValue),
      false,
      "Error details must not include plaintext credential values.",
    );
  }
}
