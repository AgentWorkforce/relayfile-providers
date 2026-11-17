import { test } from "node:test";
import assert from "node:assert/strict";
import {
  verifyProviderAuthorization,
  verifyNangoAuthorization,
  credentialTransport,
  AuthorizationProbeQueue,
} from "./index.js";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
test("real Nango record without invented flags verifies GitHub App authorization independently of sync errors", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const health = await verifyNangoAuthorization({
    secretKey: "secret-sentinel",
    connectionId: "app-1",
    providerConfigKey: "github-relay",
    fetch: async (url, init) => {
      calls.push({ url: String(url), ...(init ? { init } : {}) });
      return calls.length === 1
        ? json({
            connection_id: "app-1",
            provider_config_key: "github-relay",
            provider: "github-app-oauth",
            credentials: { type: "APP" },
            errors: [{ type: "sync", log_id: "sync-1" }],
          })
        : json({ total_count: 0, repositories: [] });
    },
  });
  assert.equal(health.authorizationStatus, "active");
  assert.equal(health.upstreamConnected, true);
  assert.equal(
    calls[1]?.url,
    "https://api.nango.dev/proxy/installation/repositories?per_page=1",
  );
  assert.equal(calls[1]?.init?.method, "GET");
  assert(!JSON.stringify(health).includes("secret-sentinel"));
});
test("connection presence or arbitrary 200 is insufficient proof", async () => {
  const health = await verifyProviderAuthorization({
    provider: "gitlab",
    transport: async () => json({ status: "ok" }),
  });
  assert.equal(health.authorizationStatus, "unknown");
  assert.equal(health.authorizationReason, "unexpected_response");
});
test("rejection, permissions, throttling and unsupported providers stay distinct", async () => {
  for (const [status, expected, reason] of [
    [401, "inactive", "credentials_rejected"],
    [403, "unknown", "insufficient_permissions"],
    [429, "unknown", "rate_limited"],
    [500, "unknown", "provider_unavailable"],
  ] as const) {
    const health = await verifyProviderAuthorization({
      provider: "gitlab",
      transport: async () => json({}, status),
    });
    assert.equal(health.authorizationStatus, expected);
    assert.equal(health.authorizationReason, reason);
  }
  let called = false;
  assert.equal(
    (
      await verifyProviderAuthorization({
        provider: "custom",
        transport: async () => {
          called = true;
          return json({});
        },
      })
    ).authorizationReason,
    "unsupported_provider",
  );
  assert.equal(called, false);
});
test("OAuth, API key and body-level Slack rejection use provider semantics", async () => {
  for (const [provider, body] of [
    ["gitlab", { id: 1, username: "user" }],
    ["granola", { notes: [] }],
    ["hubspot", { portalId: 1 }],
    ["linear", { data: { viewer: { id: "user" } } }],
  ] as const) {
    assert.equal(
      (
        await verifyProviderAuthorization({
          provider,
          transport: async () => json(body),
        })
      ).authorizationStatus,
      "active",
    );
  }
  assert.equal(
    (
      await verifyProviderAuthorization({
        provider: "slack",
        transport: async () => json({ ok: false, error: "token_revoked" }),
      })
    ).authorizationStatus,
    "inactive",
  );
});
test("native transport cannot leak credentials through redirects", async () => {
  await credentialTransport({
    accessToken: "secret",
    fetch: async (_url, init) => {
      assert.equal(init?.redirect, "manual");
      return json({});
    },
  })({ url: "https://gitlab.com/api/v4/user", method: "GET" });
});
test("native redirects are refused without following the destination", async () => {
  for (const status of [301, 302, 303, 307, 308]) {
    let calls = 0;
    const transport = credentialTransport({
      accessToken: "secret-sentinel",
      fetch: async (url, init) => {
        calls++;
        assert.equal(String(url), "https://gitlab.com/api/v4/user");
        assert.equal(init?.redirect, "manual");
        return new Response(null, { status, headers: { Location: "https://redirect.invalid/" } });
      },
    });
    await assert.rejects(transport({ url: "https://gitlab.com/api/v4/user", method: "GET" }), /refused a redirect/);
    assert.equal(calls, 1);
  }
});
test("Nango connection and proxy redirects fail closed at their respective stages", async () => {
  for (const redirectStage of [1, 2]) {
    let calls = 0;
    const health = await verifyNangoAuthorization({
      secretKey: "secret-sentinel", connectionId: "app-1", providerConfigKey: "github-relay", provider: "github",
      fetch: async (url, init) => {
        calls++;
        assert.equal(new URL(String(url)).origin, "https://api.nango.dev");
        assert.equal(init?.redirect, "manual");
        return calls === redirectStage
          ? new Response(null, { status: 302, headers: { Location: "https://redirect.invalid/" } })
          : json({ connection_id: "app-1", provider_config_key: "github-relay", provider: "github", credentials: { type: "APP" } });
      },
    });
    assert.equal(calls, redirectStage);
    assert.equal(health.authorizationStatus, "unknown");
    assert.equal(health.authorizationReason, redirectStage === 1 ? "backend_unavailable" : "provider_unavailable");
    assert(!JSON.stringify(health).includes("secret-sentinel"));
    assert(!JSON.stringify(health).includes("redirect.invalid"));
  }
});
test("bounded queue gives later rows a full network budget and deduplicates while running", async () => {
  const queue = new AuthorizationProbeQueue({
    concurrency: 2,
    networkMs: 80,
    queueMs: 500,
    maxPending: 20,
  });
  let active = 0,
    peak = 0,
    count = 0;
  const lookup = async () => {
    active++;
    peak = Math.max(peak, active);
    count++;
    await new Promise((r) => setTimeout(r, 35));
    active--;
    return {
      upstreamConnected: true,
      authorizationStatus: "active" as const,
      authorizationReason: "provider_verified",
      authorizationCheckedAt: new Date().toISOString(),
    };
  };
  const calls = Array.from({ length: 6 }, (_, i) =>
    queue.probe(String(i), lookup),
  );
  assert.equal(queue.probe("0", lookup), calls[0]);
  assert(
    (await Promise.all(calls)).every((r) => r.authorizationStatus === "active"),
  );
  assert.equal(peak, 2);
  assert.equal(count, 6);
});
test("abort-ignoring probes retain slots and queued work returns an explicit retry reason", async () => {
  const queue = new AuthorizationProbeQueue({
    concurrency: 1,
    networkMs: 10,
    queueMs: 30,
    maxPending: 2,
  });
  let release!: (
    health: Awaited<ReturnType<typeof verifyProviderAuthorization>>,
  ) => void;
  const first = queue.probe(
    "first",
    () =>
      new Promise((r) => {
        release = r;
      }),
  );
  let called = false;
  const second = queue.probe("second", async () => {
    called = true;
    throw new Error("secret");
  });
  assert.equal(
    (
      await queue.probe("overflow", async () => {
        throw new Error("secret");
      })
    ).authorizationReason,
    "checks_busy",
  );
  assert.equal((await first).authorizationReason, "check_timed_out");
  assert.equal((await second).authorizationReason, "checks_busy");
  assert.equal(called, false);
  release({
    upstreamConnected: true,
    authorizationStatus: "active",
    authorizationReason: "provider_verified",
    authorizationCheckedAt: new Date().toISOString(),
  });
});
test("custom Nango host is used for connection and proxy requests without following redirects", async () => {
  const urls: string[] = [];
  const health = await verifyNangoAuthorization({
    secretKey: "secret",
    baseUrl: "https://nango.example.test/",
    connectionId: "a",
    providerConfigKey: "gitlab",
    fetch: async (url, init) => {
      urls.push(String(url));
      assert.equal(init?.redirect, "manual");
      return urls.length === 1
        ? json({
            connection_id: "a",
            provider_config_key: "gitlab",
            provider: "gitlab",
            credentials: { type: "OAUTH2" },
            errors: [],
          })
        : json({ id: 1, username: "bot" });
    },
  });
  assert.equal(health.authorizationStatus, "active");
  assert(urls.every((url) => url.startsWith("https://nango.example.test/")));
});
test("a mismatched backend identity is never verified with another connection credentials", async () => {
  let count = 0;
  const health = await verifyNangoAuthorization({
    secretKey: "secret",
    connectionId: "expected",
    providerConfigKey: "gitlab",
    fetch: async () => {
      count++;
      return json({
        connection_id: "other",
        provider_config_key: "gitlab",
        provider: "gitlab",
        credentials: { type: "OAUTH2" },
      });
    },
  });
  assert.equal(health.authorizationStatus, "unknown");
  assert.equal(count, 1);
});
test('Jira verification uses the scope-compatible authenticated resource list',async()=>{
 const health=await verifyProviderAuthorization({provider:'jira',transport:async request=>{
  assert.equal(request.url,'https://api.atlassian.com/oauth/token/accessible-resources');return json([]);
 }});
 assert.equal(health.authorizationStatus,'active');
});
test('canonical provider selection verifies a private Nango template without using the template hostname',async()=>{
 const urls:string[]=[];
 const health=await verifyNangoAuthorization({secretKey:'secret',provider:'neon',connectionId:'a',providerConfigKey:'neon-relay',fetch:async(url,init)=>{
  urls.push(String(url));
  if(urls.length === 1) return json({connection_id:'a',provider_config_key:'neon-relay',provider:'private-api-bearer',credentials:{type:'API_KEY'},errors:[]});
  assert.equal(new Headers(init?.headers).get('Base-Url-Override'),'https://console.neon.tech');return json({id:'neon-user',email:'bot@example.test'});
 }});
 assert.equal(health.authorizationStatus,'active');
});
test('Linear personal keys use raw authorization while OAuth uses Bearer',async()=>{
 for(const [tokenType,expected] of [['api_key','lin_api_secret'],['Bearer','Bearer lin_api_secret']] as const){
  await credentialTransport({accessToken:'lin_api_secret',tokenType,fetch:async(_url,init)=>{
   assert.equal(new Headers(init?.headers).get('Authorization'),expected);return json({});
  }})({url:'https://api.linear.app/graphql',method:'POST'});
 }
});
test('Slack credential rejection is recognized for all accepted provider spellings',async()=>{
 for(const provider of ['slack','Slack','SLACK','slack-relay']){
  assert.equal((await verifyProviderAuthorization({provider,transport:async()=>json({ok:false,error:'token_revoked'})})).authorizationStatus,'inactive');
 }
});
test('Refresh deduplicates a timed-out probe until its abort-ignoring transport ends',async()=>{
 const queue=new AuthorizationProbeQueue({concurrency:2,networkMs:10,queueMs:100,maxPending:10});
 let release!: (health: Awaited<ReturnType<typeof verifyProviderAuthorization>>) => void;
 let calls=0;
 const lookup=()=>{calls++;return new Promise<Awaited<ReturnType<typeof verifyProviderAuthorization>>>(r=>{release=r;});};
 const first=queue.probe('same',lookup);
 assert.equal((await first).authorizationReason,'check_timed_out');
 assert.equal(queue.probe('same',lookup),first);assert.equal(calls,1);
 release({upstreamConnected:true,authorizationStatus:'active',authorizationReason:'provider_verified',authorizationCheckedAt:new Date().toISOString()});
 await new Promise(resolve=>setTimeout(resolve,0));
 const retried=await queue.probe('same',async()=>({upstreamConnected:true,authorizationStatus:'active',authorizationReason:'provider_verified',authorizationCheckedAt:new Date().toISOString()}));
 assert.equal(retried.authorizationStatus,'active');
});
