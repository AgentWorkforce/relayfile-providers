import type { NangoConnectionServiceConfig } from "./types.js";

export type GithubRepositoryTokenRequest = {
  providerConfigKey: string;
  connectionId: string;
  installationId: string;
  owner: string;
  repo: string;
  /** Immutable commit expected at the named base branch. */
  baseBranch: string;
  baseSha: string;
  repositoryId?: number;
  /**
   * Also request `workflows: "write"`, so the token can create or update
   * `.github/workflows/**`. Off by default: a caller opts in only for an
   * owner-approved destination. The App installation must already hold
   * "Workflows: read and write"; when it does not, minting fails with
   * `workflows_permission_not_granted` instead of returning a narrower token
   * than was asked for.
   */
  workflows?: boolean;
};

export type GithubRepositoryToken = {
  token: string;
  expiresAt: string;
  installationId: string;
  repositoryId: number;
  repositoryScoped: true;
  /** Present, and `true`, only when `workflows: true` was requested and verified. */
  workflows?: true;
};

/** Stable failure codes; the message is always `GitHub repository token: <code>`. */
export type GithubRepositoryTokenErrorCode =
  | "invalid_request"
  | "unsafe_nango_origin"
  | "transport_failed"
  | "invalid_response"
  | "connection_authority_mismatch"
  | "installation_mismatch"
  | "workflows_permission_not_granted"
  | "missing_token"
  | "token_authority_mismatch"
  | "repository_scope_mismatch"
  | "base_moved"
  | "validation_failed_cleanup_failed"
  | `upstream_status_${number}`;

export class GithubRepositoryTokenError extends Error {
  constructor(readonly code: GithubRepositoryTokenErrorCode) {
    super(`GitHub repository token: ${code}`);
    this.name = "GithubRepositoryTokenError";
  }
}

// The default request is exactly this object; the opt-in adds one key.
const permissions = { contents: "write", pull_requests: "write" } as const;
const workflowPermissions = { ...permissions, workflows: "write" } as const;
const ownerCoordinate = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;
const repositoryCoordinate = /^[A-Za-z0-9_.-]{1,100}$/;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function fail(code: GithubRepositoryTokenErrorCode): never {
  // Never include upstream bodies, credentials, URLs, or nested fetch errors.
  throw new GithubRepositoryTokenError(code);
}

async function request(
  config: NangoConnectionServiceConfig,
  url: URL,
  token: string,
  method = "GET",
  body?: unknown,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    const init: RequestInit = {
      method, redirect: "error", signal: AbortSignal.timeout(30_000),
      headers: {
        Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json",
        "Content-Type": "application/json", "User-Agent": "Relayfile",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    };
    response = config.fetch ? await config.fetch(url, init) : await globalThis.fetch(url, init);
  } catch { return fail("transport_failed"); }
  if (!response.ok) return fail(`upstream_status_${response.status}`);
  if (response.status === 204) return {};
  try { return record(await response.json()); }
  catch { return fail("invalid_response"); }
}

function github(path: string): URL { return new URL(path, "https://api.github.com"); }

/** Revoke only the newly issued token, never the connection's cached token. */
export async function revokeGithubRepositoryToken(
  config: NangoConnectionServiceConfig,
  token: string,
): Promise<void> {
  await request(config, github("/installation/token"), token, "DELETE");
}

/**
 * The caller must authorize the connection and destination before calling.
 * Nango owns the App key; only a refreshed App JWT is used server-side.
 * No installation-wide token or App JWT is returned to the caller.
 * Token permissions are repository-scoped, not branch-scoped.
 */
export async function mintGithubRepositoryToken(
  config: NangoConnectionServiceConfig,
  input: GithubRepositoryTokenRequest,
): Promise<GithubRepositoryToken> {
  if (!config.secretKey || !input.providerConfigKey || !input.connectionId ||
      !/^[1-9][0-9]*$/.test(input.installationId) ||
      !ownerCoordinate.test(input.owner) || !repositoryCoordinate.test(input.repo) || input.repo === "." || input.repo === ".." ||
      !/^[a-f0-9]{40}$/.test(input.baseSha) || !input.baseBranch ||
      (input.repositoryId !== undefined && (!Number.isSafeInteger(input.repositoryId) || input.repositoryId <= 0)) ||
      (input.workflows !== undefined && typeof input.workflows !== "boolean")) {
    return fail("invalid_request");
  }
  const base = new URL(config.baseUrl ?? "https://api.nango.dev");
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash || base.pathname !== "/") {
    return fail("unsafe_nango_origin");
  }
  const connectionUrl = new URL(`/connections/${encodeURIComponent(input.connectionId)}`, base);
  connectionUrl.searchParams.set("provider_config_key", input.providerConfigKey);
  connectionUrl.searchParams.set("refresh_github_app_jwt_token", "true");
  const connection = await request(config, connectionUrl, config.secretKey);
  const credentials = record(connection.credentials);
  const connectionConfig = record(connection.connection_config);
  if (connection.connection_id !== input.connectionId || connection.provider_config_key !== input.providerConfigKey ||
      credentials.type !== "APP" || typeof credentials.jwtToken !== "string" || !credentials.jwtToken ||
      String(connectionConfig.installation_id) !== input.installationId) {
    return fail("connection_authority_mismatch");
  }
  const repoPath = `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}`;
  const installation = await request(config, github(`${repoPath}/installation`), credentials.jwtToken);
  if (String(installation.id) !== input.installationId || installation.suspended_at != null) {
    return fail("installation_mismatch");
  }
  const workflows = input.workflows === true;
  // GitHub either refuses (422) or silently drops a permission the
  // installation lacks. Check the installation's own grant first so a missing
  // "Workflows" App permission is named, and nothing is minted for it.
  if (workflows && record(installation.permissions).workflows !== "write") {
    return fail("workflows_permission_not_granted");
  }
  // Explicit repository and permissions: omitting either widens authority.
  const minted = await request(config, github(`/app/installations/${input.installationId}/access_tokens`), credentials.jwtToken, "POST", {
    ...(input.repositoryId === undefined ? { repositories: [input.repo] } : { repository_ids: [input.repositoryId] }),
    permissions: workflows ? workflowPermissions : permissions,
  });
  if (typeof minted.token !== "string" || !minted.token) return fail("missing_token");
  try {
    const expires = typeof minted.expires_at === "string" ? Date.parse(minted.expires_at) : NaN;
    const granted = record(minted.permissions);
    const expected: readonly string[] = Object.keys(workflows ? workflowPermissions : permissions);
    if (!Number.isFinite(expires) || expires <= Date.now() + 60_000 || expires > Date.now() + 3_660_000 ||
        granted.contents !== "write" || granted.pull_requests !== "write" ||
        Object.entries(granted).some(([key, value]) => !(expected.includes(key) || (key === "metadata" && value === "read")))) {
      return fail("token_authority_mismatch");
    }
    // Asked for workflows and GitHub dropped it: never hand back a token
    // narrower than the caller's grant says it is.
    if (workflows && granted.workflows !== "write") return fail("workflows_permission_not_granted");
    const scope = await request(config, github("/installation/repositories?per_page=2"), minted.token);
    const repos = scope.repositories;
    const repo = Array.isArray(repos) && repos.length === 1 ? record(repos[0]) : {};
    if (scope.total_count !== 1 || typeof repo.full_name !== "string" ||
        repo.full_name.toLowerCase() !== `${input.owner}/${input.repo}`.toLowerCase() ||
        !Number.isSafeInteger(repo.id) || (repo.id as number) <= 0 ||
        (input.repositoryId !== undefined && repo.id !== input.repositoryId)) return fail("repository_scope_mismatch");
    const ref = await request(config, github(`${repoPath}/git/ref/heads/${encodeURIComponent(input.baseBranch)}`), minted.token);
    if (ref.ref !== `refs/heads/${input.baseBranch}` || record(ref.object).type !== "commit" || record(ref.object).sha !== input.baseSha) {
      return fail("base_moved");
    }
    return { token: minted.token, expiresAt: minted.expires_at as string, installationId: input.installationId,
      repositoryId: repo.id as number, repositoryScoped: true, ...(workflows ? { workflows: true as const } : {}) };
  } catch (error) {
    try { await revokeGithubRepositoryToken(config, minted.token); }
    catch { return fail("validation_failed_cleanup_failed"); }
    throw error;
  }
}
