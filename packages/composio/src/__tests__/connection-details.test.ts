import assert from "node:assert/strict";
import { test } from "node:test";
import { composioAuthorizationStatus, composioAuthMode } from "../index.js";

test("normalizes authorization without guessing missing or pending status", () => {
  for (const status of ["ACTIVE", " authorized ", "CONNECTED", "READY", "ENABLED", "SUCCESS"])
    assert.equal(composioAuthorizationStatus({ status }), "active");
  for (const status of ["INACTIVE", "EXPIRED", "DISABLED", "FAILED", "REVOKED"])
    assert.equal(composioAuthorizationStatus({ status }), "inactive");
  for (const status of [undefined, "INITIATED", "UNKNOWN", 1])
    assert.equal(composioAuthorizationStatus({ status }), "unknown");
  assert.equal(composioAuthorizationStatus({ status: "ACTIVE", is_disabled: true }), "inactive");
  assert.equal(composioAuthorizationStatus({ status: "ACTIVE", auth_config: { is_disabled: true } }), "inactive");
  assert.equal(composioAuthorizationStatus({ state: { val: { status: "ACTIVE" } } }), "active");
});

test("projects only recognized authentication kinds", () => {
  assert.equal(composioAuthMode({ authScheme: "oauth2" }), "OAUTH2");
  assert.equal(composioAuthMode({ auth_config: { auth_scheme: "API_KEY" } }), "API_KEY");
  assert.equal(composioAuthMode({ authScheme: "private-token" }), null);
  assert.equal(composioAuthMode({ state: { val: { authScheme: "API_KEY", api_key: "private-token" } } }), null);
  assert.equal(composioAuthMode({ auth_config: [] }), null);
});
