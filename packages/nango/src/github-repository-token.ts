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
};

export type GithubRepositoryToken = {
  token: string;
  expiresAt: string;
  installationId: string;
  repositoryId: number;
  repositoryScoped: true;
};

const permissions = { contents: "write", pull_requests: "write" } as const;
const coordinate = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function fail(code: string): never {
  // Never include upstream bodies, credentials, URLs, or nested fetch errors.
  throw new Error(`GitHub repository token: ${code}`);
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
      !coordinate.test(input.owner) || !coordinate.test(input.repo) ||
      !/^[a-f0-9]{40}$/.test(input.baseSha) || !input.baseBranch ||
      (input.repositoryId !== undefined && (!Number.isSafeInteger(input.repositoryId) || input.repositoryId <= 0))) {
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
  // Explicit repository and permissions: omitting either widens authority.
  const minted = await request(config, github(`/app/installations/${input.installationId}/access_tokens`), credentials.jwtToken, "POST", {
    ...(input.repositoryId === undefined ? { repositories: [input.repo] } : { repository_ids: [input.repositoryId] }),
    permissions,
  });
  if (typeof minted.token !== "string" || !minted.token) return fail("missing_token");
  try {
    const expires = typeof minted.expires_at === "string" ? Date.parse(minted.expires_at) : NaN;
    const granted = record(minted.permissions);
    if (!Number.isFinite(expires) || expires <= Date.now() + 60_000 || expires > Date.now() + 3_660_000 ||
        granted.contents !== "write" || granted.pull_requests !== "write" ||
        Object.entries(granted).some(([key, value]) => !(["contents", "pull_requests"].includes(key) || (key === "metadata" && value === "read")))) {
      return fail("token_authority_mismatch");
    }
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
      repositoryId: repo.id as number, repositoryScoped: true };
  } catch (error) {
    try { await revokeGithubRepositoryToken(config, minted.token); }
    catch { return fail("validation_failed_cleanup_failed"); }
    throw error;
  }
}
