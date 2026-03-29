import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { NangoProxyTransportError } from "../errors.js";
import {
  buildNangoProxyRequest,
  parseNangoProxyResponse,
  proxyThroughNango,
} from "../proxy.js";
import { assertProxyResponse, createFetchMock } from "./helpers/test-utils.js";

describe("proxyThroughNango", () => {
  it("targets the Nango proxy endpoint with the expected auth and routing headers", () => {
    const descriptor = buildNangoProxyRequest(
      {
        secretKey: "secret-key",
        baseUrl: "https://api.nango.test/",
        providerConfigKey: "github",
      },
      {
        method: "POST",
        baseUrl: "https://api.github.com/",
        endpoint: "/repos/octocat/hello-world/issues",
        connectionId: "conn_123",
        body: {
          title: "Bug report",
        },
      },
    );

    assert.equal(descriptor.url, "https://api.nango.test/proxy");
    assert.equal(descriptor.providerConfigKey, "github");
    assert.equal(descriptor.init.method, "POST");

    const headers = new Headers(descriptor.init.headers);
    assert.equal(headers.get("accept"), "application/json");
    assert.equal(headers.get("authorization"), "Bearer secret-key");
    assert.equal(headers.get("connection-id"), "conn_123");
    assert.equal(headers.get("content-type"), "application/json");
    assert.equal(headers.get("provider-config-key"), "github");
  });

  it("forwards method, baseUrl, endpoint, params, headers, and body through the Nango proxy", async () => {
    const fetchMock = createFetchMock();
    fetchMock.queueJson(
      {
        login: "octocat",
        id: 1,
      },
      200,
      {
        "x-request-id": "req_123",
      },
    );

    const response = await proxyThroughNango(
      {
        secretKey: "secret-key",
        baseUrl: "https://api.nango.test/",
        providerConfigKey: "github",
        fetch: fetchMock.fetch,
      },
      {
        method: "PATCH",
        baseUrl: "https://api.github.com/",
        endpoint: "repos/octocat/hello-world/issues/1",
        connectionId: "conn_123",
        headers: {
          accept: "application/json",
          "x-github-api-version": "2022-11-28",
        },
        body: {
          title: "Renamed issue",
        },
        query: {
          per_page: "1",
          state: "open",
        },
      },
    );

    assertProxyResponse(response, {
      status: 200,
      data: {
        login: "octocat",
        id: 1,
      },
      headers: {
        "content-type": "application/json",
        "x-request-id": "req_123",
      },
    });

    assert.equal(fetchMock.calls.length, 1);
    const [call] = fetchMock.calls;
    assert.ok(call);
    assert.equal(call.url, "https://api.nango.test/proxy");
    assert.equal(call.method, "POST");
    assert.equal(call.headers.get("authorization"), "Bearer secret-key");
    assert.equal(call.headers.get("connection-id"), "conn_123");
    assert.equal(call.headers.get("provider-config-key"), "github");

    assert.deepEqual(JSON.parse(call.bodyText ?? ""), {
      method: "PATCH",
      baseUrlOverride: "https://api.github.com",
      endpoint: "/repos/octocat/hello-world/issues/1",
      headers: {
        accept: "application/json",
        "x-github-api-version": "2022-11-28",
      },
      data: {
        title: "Renamed issue",
      },
      params: {
        per_page: "1",
        state: "open",
      },
    });
  });

  it("returns parsed 4xx responses without throwing", async () => {
    const fetchMock = createFetchMock();
    fetchMock.queueJson(
      {
        error: {
          message: "Forbidden",
        },
      },
      403,
      {
        "x-request-id": "req_forbidden",
      },
    );

    const response = await proxyThroughNango(
      {
        secretKey: "secret-key",
        providerConfigKey: "github",
        fetch: fetchMock.fetch,
      },
      {
        method: "GET",
        baseUrl: "https://api.github.com",
        endpoint: "/user",
        connectionId: "conn_123",
      },
    );

    assertProxyResponse(response, {
      status: 403,
      data: {
        error: {
          message: "Forbidden",
        },
      },
      headers: {
        "content-type": "application/json",
        "x-request-id": "req_forbidden",
      },
    });
  });

  it("returns parsed 5xx responses without throwing", async () => {
    const fetchMock = createFetchMock();
    fetchMock.queueJson(
      {
        error: "upstream unavailable",
      },
      502,
      {
        "x-request-id": "req_bad_gateway",
      },
    );

    const response = await proxyThroughNango(
      {
        secretKey: "secret-key",
        providerConfigKey: "github",
        fetch: fetchMock.fetch,
      },
      {
        method: "DELETE",
        baseUrl: "https://api.github.com",
        endpoint: "/repos/octocat/hello-world/hooks/1",
        connectionId: "conn_456",
      },
    );

    assertProxyResponse(response, {
      status: 502,
      data: {
        error: "upstream unavailable",
      },
      headers: {
        "content-type": "application/json",
        "x-request-id": "req_bad_gateway",
      },
    });
  });

  it("wraps fetch failures in NangoProxyTransportError", async () => {
    const fetchMock = createRejectingFetchMock(new Error("socket hang up"));

    await assert.rejects(
      proxyThroughNango(
        {
          secretKey: "secret-key",
          fetch: fetchMock.fetch,
        },
        {
          method: "GET",
          baseUrl: "https://api.github.com",
          endpoint: "/user",
          connectionId: "conn_123",
        },
      ),
      (error: unknown) =>
        error instanceof NangoProxyTransportError &&
        error.url === "https://api.nango.dev/proxy" &&
        error.cause instanceof Error &&
        error.cause.message === "socket hang up",
    );

    assert.equal(fetchMock.calls.length, 1);
    assert.equal(fetchMock.calls[0]?.url, "https://api.nango.dev/proxy");
    assert.equal(fetchMock.calls[0]?.method, "POST");
  });
});

describe("parseNangoProxyResponse", () => {
  it("parses successful JSON responses", async () => {
    const parsed = await parseNangoProxyResponse(
      new Response(JSON.stringify({ ok: true }), {
        status: 202,
        headers: {
          "content-type": "application/json",
          "x-request-id": "req_success",
        },
      }),
    );

    assert.deepEqual(parsed, {
      status: 202,
      headers: {
        "content-type": "application/json",
        "x-request-id": "req_success",
      },
      data: {
        ok: true,
      },
    });
  });

  it("returns null for empty response bodies", async () => {
    const parsed = await parseNangoProxyResponse(
      new Response("", {
        status: 200,
        headers: {
          "x-request-id": "req_empty",
        },
      }),
    );

    assert.deepEqual(parsed, {
      status: 200,
      headers: {
        "content-type": "text/plain;charset=UTF-8",
        "x-request-id": "req_empty",
      },
      data: null,
    });
  });

  it("returns null for 204 responses", async () => {
    const parsed = await parseNangoProxyResponse(new Response(null, { status: 204 }));

    assert.deepEqual(parsed, {
      status: 204,
      headers: {},
      data: null,
    });
  });
});

function createRejectingFetchMock(error: Error): {
  calls: Array<{ method: string; url: string }>;
  fetch: typeof fetch;
} {
  const calls: Array<{ method: string; url: string }> = [];

  return {
    calls,
    fetch: async (input, init) => {
      const request = input instanceof Request ? new Request(input, init) : new Request(input, init);
      calls.push({
        method: request.method.toUpperCase(),
        url: request.url,
      });
      throw error;
    },
  };
}
