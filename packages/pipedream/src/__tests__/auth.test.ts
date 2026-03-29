import test from "node:test";
import assert from "node:assert/strict";
import { PipedreamAuthSession } from "../auth.js";
import { jsonResponse } from "./helpers.js";

test("PipedreamAuthSession caches bearer tokens until expiry", async () => {
  let calls = 0;
  const auth = new PipedreamAuthSession({
    clientId: "cid",
    clientSecret: "secret",
    projectId: "proj_123",
    fetch: async () => {
      calls += 1;
      return jsonResponse({
        body: {
          access_token: `token_${calls}`,
          token_type: "bearer",
          expires_in: 3600,
        },
      });
    },
  });

  assert.equal(await auth.getBearerToken(), "token_1");
  assert.equal(await auth.getBearerToken(), "token_1");
  assert.equal(calls, 1);
});

test("PipedreamAuthSession invalidates token cache", async () => {
  let calls = 0;
  const auth = new PipedreamAuthSession({
    clientId: "cid",
    clientSecret: "secret",
    projectId: "proj_123",
    fetch: async () => {
      calls += 1;
      return jsonResponse({
        body: {
          access_token: `token_${calls}`,
          token_type: "bearer",
          expires_in: 3600,
        },
      });
    },
  });

  assert.equal(await auth.getBearerToken(), "token_1");
  auth.invalidate();
  assert.equal(await auth.getBearerToken(), "token_2");
  assert.equal(calls, 2);
});

test("PipedreamAuthSession reuses one in-flight refresh", async () => {
  let calls = 0;
  const auth = new PipedreamAuthSession({
    clientId: "cid",
    clientSecret: "secret",
    projectId: "proj_123",
    fetch: async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return jsonResponse({
        body: {
          access_token: `token_${calls}`,
          token_type: "bearer",
          expires_in: 3600,
        },
      });
    },
  });

  const [first, second] = await Promise.all([
    auth.getBearerToken(),
    auth.getBearerToken(),
  ]);

  assert.equal(first, "token_1");
  assert.equal(second, "token_1");
  assert.equal(calls, 1);
});
