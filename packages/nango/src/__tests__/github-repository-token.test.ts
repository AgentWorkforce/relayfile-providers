import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mintGithubRepositoryToken } from "../github-repository-token.js";

const input = { providerConfigKey: "github-app", connectionId: "connected", installationId: "41",
  owner: "example", repo: "project", baseBranch: "main", baseSha: "a".repeat(40) };
const connection = () => ({ connection_id: "connected", provider_config_key: "github-app",
  connection_config: { installation_id: "41" }, credentials: { type: "APP", jwtToken: "private-app-jwt", access_token: "wide-token-never-export" } });
const minted = () => ({ token: "private-scoped-token", expires_at: new Date(Date.now() + 3_600_000).toISOString(),
  permissions: { contents: "write", pull_requests: "write", metadata: "read" } });
const scope = () => ({ total_count: 1, repositories: [{ id: 7, full_name: "example/project" }] });
function harness(overrides: Record<string, unknown> = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const payloads: Record<string, unknown> = {
    "/connections/connected": connection(), "/repos/example/project/installation": { id: 41 },
    "/app/installations/41/access_tokens": minted(), "/installation/repositories": scope(),
    "/repos/example/project/git/ref/heads/main": { ref: "refs/heads/main", object: { type: "commit", sha: input.baseSha } },
    ...overrides,
  };
  const fetchImpl = (async (url: URL | RequestInfo, init: RequestInit) => {
    const parsed = new URL(String(url)); calls.push({ url: parsed.href, init });
    if (parsed.pathname === "/installation/token") return new Response(null, { status: 204 });
    const value = payloads[parsed.pathname];
    if (value instanceof Error) throw value;
    assert.ok(value, `unexpected request ${parsed.pathname}`);
    return Response.json(value);
  }) as typeof fetch;
  return { config: { secretKey: "private-nango-secret", fetch: fetchImpl }, calls };
}

describe("repository-scoped GitHub App token", () => {
  it("uses a refreshed App JWT and verifies one-repo permissions and immutable base", async () => {
    const h = harness(); const result = await mintGithubRepositoryToken(h.config, input);
    assert.equal(result.repositoryScoped, true); assert.equal(result.repositoryId, 7);
    assert.equal(result.token, "private-scoped-token");
    assert.equal(new URL(h.calls[0]!.url).searchParams.get("refresh_github_app_jwt_token"), "true");
    assert.deepEqual(JSON.parse(h.calls[2]!.init.body as string), { repositories: ["project"], permissions: { contents: "write", pull_requests: "write" } });
    for (const call of h.calls) assert.equal(call.init.redirect, "error");
    assert.equal(new Headers(h.calls[2]!.init.headers).get("authorization"), "Bearer private-app-jwt");
    assert.equal(JSON.stringify(h.calls).includes("wide-token-never-export"), false);
  });
  it("pins the numeric repository identity on later minting", async () => {
    const h = harness(); await mintGithubRepositoryToken(h.config, { ...input, repositoryId: 7 });
    assert.deepEqual(JSON.parse(h.calls[2]!.init.body as string).repository_ids, [7]);
  });
  for (const [name, changed] of Object.entries({
    "connection": { ...connection(), connection_id: "other" },
    "provider": { ...connection(), provider_config_key: "other" },
    "installation": { ...connection(), connection_config: { installation_id: "99" } },
    "oauth": { ...connection(), credentials: { type: "OAUTH2", access_token: "private-secret" } },
    "missing JWT": { ...connection(), credentials: { type: "APP", access_token: "private-secret" } },
  })) it(`refuses ${name} mismatch before token mint`, async () => {
    const h = harness({ "/connections/connected": changed });
    await assert.rejects(mintGithubRepositoryToken(h.config, input), /connection_authority_mismatch/);
    assert.equal(h.calls.length, 1);
  });
  it("refuses another App installation before mint", async () => {
    const h = harness({ "/repos/example/project/installation": { id: 99 } });
    await assert.rejects(mintGithubRepositoryToken(h.config, input), /installation_mismatch/);
    assert.equal(h.calls.length, 2);
  });
  for (const [name, overrides, reason] of [
    ["extra repository", { "/installation/repositories": { total_count: 2, repositories: [{ id: 7, full_name: "example/project" }] } }, "repository_scope_mismatch"],
    ["wrong repository", { "/installation/repositories": { total_count: 1, repositories: [{ id: 7, full_name: "example/other" }] } }, "repository_scope_mismatch"],
    ["extra permission", { "/app/installations/41/access_tokens": { ...minted(), permissions: { ...minted().permissions, administration: "write" } } }, "token_authority_mismatch"],
    ["missing permission", { "/app/installations/41/access_tokens": { ...minted(), permissions: { contents: "write" } } }, "token_authority_mismatch"],
    ["expired token", { "/app/installations/41/access_tokens": { ...minted(), expires_at: "2000-01-01" } }, "token_authority_mismatch"],
    ["moved base", { "/repos/example/project/git/ref/heads/main": { ref: "refs/heads/main", object: { type: "commit", sha: "b".repeat(40) } } }, "base_moved"],
  ] as const) it(`revokes newly minted token on ${name}`, async () => {
    const h = harness(overrides);
    await assert.rejects(mintGithubRepositoryToken(h.config, input), new RegExp(reason));
    assert.equal(new URL(h.calls.at(-1)!.url).pathname, "/installation/token");
    assert.equal(h.calls.at(-1)!.init.method, "DELETE");
  });
  it("rejects a replaced repository identity and revokes the token", async () => {
    const h = harness();
    await assert.rejects(mintGithubRepositoryToken(h.config, { ...input, repositoryId: 8 }), /repository_scope_mismatch/);
    assert.equal(h.calls.at(-1)!.init.method, "DELETE");
  });
  it("surfaces cleanup failure without revealing either token", async () => {
    const h = harness({ "/installation/repositories": { total_count: 0, repositories: [] } });
    const request = h.config.fetch;
    h.config.fetch = (async (url, init) => {
      if (new URL(String(url)).pathname === "/installation/token") throw new Error("private-scoped-token");
      return request(url, init);
    }) as typeof fetch;
    await assert.rejects(mintGithubRepositoryToken(h.config, input), /validation_failed_cleanup_failed/);
  });
  it("rejects insecure Nango transport without sending credentials", async () => {
    const h = harness();
    await assert.rejects(mintGithubRepositoryToken({ ...h.config, baseUrl: "http://example.test" }, input), /unsafe_nango_origin/);
    assert.equal(h.calls.length, 0);
  });
  it("redacts transport error details and does not retry ambiguous mint", async () => {
    const h = harness({ "/app/installations/41/access_tokens": new Error("private-app-jwt") });
    await assert.rejects(mintGithubRepositoryToken(h.config, input), error => {
      assert.equal((error as Error).message, "GitHub repository token: transport_failed"); return true;
    });
    assert.equal(h.calls.length, 3);
  });
});
