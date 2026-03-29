import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { NangoRefreshHttpError } from "../errors.js";
import {
  assertProxyResponse,
  cleanupProviderHarness,
  createProviderHarness,
  findRefreshCalls,
  type ProviderHarness,
} from "./helpers/test-utils.js";
import {
  buildExpiredTokenProxyFailure,
  buildProxySuccessResponse,
  buildRefreshFailureResponse,
  buildRefreshSuccessResponse,
  buildTerminalProxyFailure,
} from "./fixtures/nango-responses.js";

describe("proxy token refresh", () => {
  let harness: ProviderHarness | undefined;

  beforeEach(async () => {
    harness = await createProviderHarness({
      baseUrl: "https://api.nango.test",
    });
  });

  afterEach(async () => {
    await cleanupProviderHarness(harness);
    harness = undefined;
  });

  it("triggers refresh on a 401 proxy failure and retries successfully", async () => {
    harness!.server.register("POST", "/proxy", buildExpiredTokenProxyFailure());
    harness!.server.register(
      "POST",
      "/connection/conn_live/refresh",
      buildRefreshSuccessResponse({ connectionId: "conn_live" }),
    );
    harness!.server.register(
      "POST",
      "/proxy",
      buildProxySuccessResponse({
        data: { ok: true, attempt: "retry" },
        headers: { "x-proxy-attempt": "retry" },
      }),
    );

    const request = harness!.buildProxyRequest({
      method: "PATCH",
      endpoint: "/repos/octocat/hello-world/issues/1",
      headers: {
        accept: "application/json",
        "x-github-api-version": "2022-11-28",
      },
      body: {
        title: "Refresh and retry",
      },
      query: {
        per_page: "1",
        state: "open",
      },
    });

    const response = await harness!.provider.proxy!(request);

    assertProxyResponse(response, {
      status: 200,
      data: { ok: true, attempt: "retry" },
      headers: { "x-proxy-attempt": "retry" },
    });

    const proxyCalls = harness!.server.callsFor("POST", "/proxy");
    const [refreshCall] = findRefreshCalls(harness!.server, "conn_live");

    assert.equal(proxyCalls.length, 2);
    assert.ok(refreshCall);
    assert.equal(refreshCall.headers.authorization, "Bearer test-secret-key");
    assert.deepEqual(refreshCall.searchParams.provider_config_key, ["github"]);
    assert.deepEqual(proxyCalls.map((call) => call.jsonBody), [
      {
        method: "PATCH",
        baseUrlOverride: "https://api.github.com",
        endpoint: "/repos/octocat/hello-world/issues/1",
        headers: {
          accept: "application/json",
          "x-github-api-version": "2022-11-28",
        },
        data: {
          title: "Refresh and retry",
        },
        params: {
          per_page: "1",
          state: "open",
        },
      },
      {
        method: "PATCH",
        baseUrlOverride: "https://api.github.com",
        endpoint: "/repos/octocat/hello-world/issues/1",
        headers: {
          accept: "application/json",
          "x-github-api-version": "2022-11-28",
        },
        data: {
          title: "Refresh and retry",
        },
        params: {
          per_page: "1",
          state: "open",
        },
      },
    ]);
  });

  it("triggers refresh on stale-token proxy failures and retries successfully", async () => {
    harness!.server.error("POST", "/proxy", 400, {
      error: {
        code: "bad_token",
        message: "Stale token rejected by upstream",
      },
    });
    harness!.server.register(
      "POST",
      "/connection/conn_live/refresh",
      buildRefreshSuccessResponse({ connectionId: "conn_live" }),
    );
    harness!.server.register(
      "POST",
      "/proxy",
      buildProxySuccessResponse({
        data: { recovered: true, attempt: "retry" },
      }),
    );

    const response = await harness!.provider.proxy!(harness!.buildProxyRequest());

    assertProxyResponse(response, {
      status: 200,
      data: { recovered: true, attempt: "retry" },
    });
    assert.equal(harness!.server.callsFor("POST", "/proxy").length, 2);
    assert.equal(findRefreshCalls(harness!.server, "conn_live").length, 1);
  });

  it("surfaces refresh endpoint failures as NangoRefreshHttpError", async () => {
    harness!.server.register("POST", "/proxy", buildExpiredTokenProxyFailure());
    harness!.server.register("POST", "/connection/conn_live/refresh", buildRefreshFailureResponse());

    await assert.rejects(
      harness!.provider.proxy!(harness!.buildProxyRequest()),
      (error: unknown) => {
        assert.ok(error instanceof NangoRefreshHttpError);
        assert.equal(error.status, 400);
        assert.deepEqual(error.responseBody, {
          error: {
            code: "refresh_failed",
            message: "Refresh token is no longer valid",
          },
        });
        return true;
      },
    );

    assert.equal(harness!.server.callsFor("POST", "/proxy").length, 1);
    assert.equal(findRefreshCalls(harness!.server, "conn_live").length, 1);
  });

  it("does not retry non-refreshable proxy failures", async () => {
    harness!.server.register("POST", "/proxy", buildTerminalProxyFailure());

    const response = await harness!.provider.proxy!(harness!.buildProxyRequest());

    assertProxyResponse(response, {
      status: 403,
      data: {
        error: {
          code: "permission_denied",
          message: "The upstream provider rejected the request",
        },
      },
    });
    assert.equal(harness!.server.callsFor("POST", "/proxy").length, 1);
    assert.equal(findRefreshCalls(harness!.server, "conn_live").length, 0);
  });

  it("retries at most once per request", async () => {
    harness!.server.register("POST", "/proxy", buildExpiredTokenProxyFailure());
    harness!.server.register(
      "POST",
      "/connection/conn_live/refresh",
      buildRefreshSuccessResponse({ connectionId: "conn_live" }),
    );
    harness!.server.register("POST", "/proxy", buildExpiredTokenProxyFailure());

    const response = await harness!.provider.proxy!(harness!.buildProxyRequest());

    assertProxyResponse(response, {
      status: 401,
      data: {
        error: {
          code: "token_expired",
          message: "Access token expired",
        },
      },
    });
    assert.equal(harness!.server.callsFor("POST", "/proxy").length, 2);
    assert.equal(findRefreshCalls(harness!.server, "conn_live").length, 1);
  });
});
