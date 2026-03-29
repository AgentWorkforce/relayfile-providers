import assert from "node:assert/strict";
import test from "node:test";

import { createMockNangoServer } from "./mock-nango.js";

test("createMockNangoServer captures calls and returns queued json responses", async () => {
  const server = createMockNangoServer({ baseUrl: "https://api.nango.test/" });

  server.json("POST", "/proxy", { ok: true });

  const response = await server.fetch("https://api.nango.test/proxy?expand=user&expand=org", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-test-header": "present",
    },
    body: JSON.stringify({ endpoint: "/user" }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });

  const [call] = server.callsFor("POST", "/proxy");
  assert.ok(call);
  assert.equal(call.method, "POST");
  assert.equal(call.path, "/proxy");
  assert.equal(call.url, "https://api.nango.test/proxy?expand=user&expand=org");
  assert.equal(call.headers["content-type"], "application/json");
  assert.equal(call.headers["x-test-header"], "present");
  assert.deepEqual(call.searchParams, { expand: ["user", "org"] });
  assert.equal(call.bodyText, JSON.stringify({ endpoint: "/user" }));
  assert.deepEqual(call.jsonBody, { endpoint: "/user" });
});

test("createMockNangoServer supports queued responses and canned errors", async () => {
  const server = createMockNangoServer({ baseUrl: "https://api.nango.test" });

  server.json("GET", "/connections", { page: 1 });
  server.error("GET", "/connections", 429, { error: "rate_limited" });

  const first = await server.fetch("/connections");
  const second = await server.fetch("/connections");

  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { page: 1 });
  assert.equal(second.status, 429);
  assert.deepEqual(await second.json(), { error: "rate_limited" });
});

test("createMockNangoServer route alias accepts resolver functions", async () => {
  const server = createMockNangoServer({ baseUrl: "https://api.nango.test" });

  server.route("GET", "/connection/conn_live", (call) => ({
    status: 200,
    json: {
      connectionId: call.path.split("/").at(-1),
      provider: call.searchParams.provider_config_key?.[0],
    },
  }));

  const response = await server.fetch("/connection/conn_live?provider_config_key=github");

  assert.deepEqual(await response.json(), {
    connectionId: "conn_live",
    provider: "github",
  });
});

test("createMockNangoServer reset clears routes and captured calls", async () => {
  const server = createMockNangoServer({ baseUrl: "https://api.nango.test" });

  server.json("GET", "/connections", { ok: true });
  await server.fetch("/connections");

  assert.equal(server.getCalls().length, 1);

  server.reset();

  assert.equal(server.getCalls().length, 0);

  await assert.rejects(
    () => server.fetch("/connections"),
    /No mock Nango route registered for GET \/connections\./,
  );
});
