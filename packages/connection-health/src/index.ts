/** No credentials, provider error bodies or identity payloads belong in this result. */
export type AuthorizationHealth = {
  authorizationStatus: "active" | "inactive" | "unknown";
  authorizationReason: string;
  authorizationCheckedAt: string;
  upstreamConnected: boolean | null;
  authMode?: string;
};
export type AuthorizationRequest = {
  url: string;
  method: "GET" | "POST";
  body?: string;
};
export type AuthorizationTransport = (
  request: AuthorizationRequest,
) => Promise<Response>;
type Check = AuthorizationRequest & {
  arrayResponse?: boolean;
  valid: (body: Record<string, unknown>) => boolean;
};
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
function result(
  authorizationStatus: AuthorizationHealth["authorizationStatus"],
  authorizationReason: string,
): AuthorizationHealth {
  return {
    upstreamConnected: null,
    authorizationStatus,
    authorizationReason,
    authorizationCheckedAt: new Date().toISOString(),
  };
}
function checkFor(provider: string, authMode?: string): Check | null {
  const p = provider.toLowerCase().replace(/-relay$/, "");
  if (
    [
      "github",
      "github-app",
      "github-app-oauth",
      "github-oauth",
      "github-pat",
    ].includes(p)
  )
    return {
      url: `https://api.github.com${authMode?.toUpperCase() === "APP" ? "/installation/repositories?per_page=1" : "/user"}`,
      method: "GET",
      valid: (b) =>
        authMode?.toUpperCase() === "APP"
          ? typeof b.total_count === "number" && Array.isArray(b.repositories)
          : !!b.id && typeof b.login === "string",
    };
  if (p === "gitlab")
    return {
      url: "https://gitlab.com/api/v4/user",
      method: "GET",
      valid: (b) => !!b.id && typeof b.username === "string",
    };
  if (["google-mail", "gmail", "google-mail-oauth2"].includes(p))
    return {
      url: "https://gmail.googleapis.com/gmail/v1/users/me/profile",
      method: "GET",
      valid: (b) => typeof b.emailAddress === "string",
    };
  if (p === "hubspot")
    return {
      url: "https://api.hubapi.com/integrations/v1/me",
      method: "GET",
      valid: (b) => typeof b.portalId === "number",
    };
  if (p === "granola")
    return {
      url: "https://public-api.granola.ai/v1/notes?page_size=1",
      method: "GET",
      valid: (b) => Array.isArray(b.notes),
    };
  if (p === "notion")
    return {
      url: "https://api.notion.com/v1/users/me",
      method: "GET",
      valid: (b) => b.object === "user" && typeof b.id === "string",
    };
  if (p === "linear")
    return {
      url: "https://api.linear.app/graphql",
      method: "POST",
      body: JSON.stringify({
        query: "query ConnectionAuthorization { viewer { id } }",
      }),
      valid: (b) => typeof object(object(b.data).viewer).id === "string",
    };
  if (p === "slack")
    return {
      url: "https://slack.com/api/auth.test",
      method: "POST",
      valid: (b) => b.ok === true && typeof b.team_id === "string",
    };
  if (p === "jira" || p === "atlassian")
    return {
      url: "https://api.atlassian.com/oauth/token/accessible-resources",
      method: "GET",
      arrayResponse: true,
      valid: (b) => typeof b.id === "string",
    };
  if (p === "neon")
    return {
      url: "https://console.neon.tech/api/v2/users/me",
      method: "GET",
      valid: (b) => ["string", "number"].includes(typeof object(b.user).id),
    };
  if (p === "reddit")
    return {
      url: "https://oauth.reddit.com/api/v1/me",
      method: "GET",
      valid: (b) => typeof b.id === "string" && typeof b.name === "string",
    };
  if (p === "telegram")
    return {
      url: "https://api.telegram.org/getMe",
      method: "GET",
      valid: (b) => b.ok === true && typeof object(b.result).id === "number",
    };
  if (p === "cloudflare")
    return {
      url: "https://api.cloudflare.com/client/v4/user/tokens/verify",
      method: "GET",
      valid: (b) => b.success === true && object(b.result).status === "active",
    };
  if (p === "shortcut")
    return {
      url: "https://api.app.shortcut.com/api/v3/member",
      method: "GET",
      valid: (b) => typeof b.id === "string",
    };
  return null;
}
/** A saved token or a 200 with an arbitrary body is never proof of authorization. */
export async function verifyProviderAuthorization(input: {
  provider: string;
  authMode?: string;
  transport: AuthorizationTransport;
}): Promise<AuthorizationHealth> {
  const check = checkFor(input.provider, input.authMode);
  if (!check) return result("unknown", "unsupported_provider");
  try {
    const response = await input.transport(check);
    if (response.status === 401)
      return result("inactive", "credentials_rejected");
    if (response.status === 403)
      return result("unknown", "insufficient_permissions");
    if (response.status === 429) return result("unknown", "rate_limited");
    if (!response.ok) return result("unknown", "provider_unavailable");
    const raw = (await response.json()) as unknown;
    const body = object(raw);
    if (
      input.provider.startsWith("slack") &&
      [
        "invalid_auth",
        "token_revoked",
        "token_expired",
        "account_inactive",
      ].includes(String(body.error))
    )
      return result("inactive", "credentials_rejected");
    return (
      check.arrayResponse
        ? Array.isArray(raw) && raw.every((item) => check.valid(object(item)))
        : check.valid(body)
    )
      ? result("active", "provider_verified")
      : result("unknown", "unexpected_response");
  } catch {
    return result("unknown", "provider_unavailable");
  }
}

/** Native credentials stay inside the credential authority; redirects never receive them. */
export function credentialTransport(input: {
  accessToken: string;
  tokenType?: string;
  signal?: AbortSignal;
  fetch?: typeof fetch;
}): AuthorizationTransport {
  return (request) => {
    const target = new URL(request.url);
    if (target.hostname === "api.telegram.org")
      target.pathname = `/bot${input.accessToken}/getMe`;
    return (input.fetch ?? fetch)(target, {
      method: request.method,
      redirect: "error",
      headers: {
        Authorization: `${input.tokenType?.toLowerCase() === "api_key" ? "Bearer" : (input.tokenType ?? "Bearer")} ${input.accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
        "User-Agent": "AgentRelay-ConnectionHealth/1.0",
        ...(target.hostname === "api.app.shortcut.com"
          ? { "Shortcut-Token": input.accessToken }
          : {}),
      },
      ...(request.body ? { body: request.body } : {}),
      ...(input.signal ? { signal: input.signal } : {}),
    });
  };
}

/** Nango's documented record is credentials + errors[], not fabricated active/status flags. */
export async function verifyNangoAuthorization(input: {
  secretKey: string;
  baseUrl?: string;
  provider?: string;
  connectionId: string;
  providerConfigKey: string;
  signal?: AbortSignal;
  fetch?: typeof fetch;
}): Promise<AuthorizationHealth> {
  const fetchImpl = input.fetch ?? fetch;
  const origin = (input.baseUrl ?? "https://api.nango.dev").replace(/\/+$/, "");
  const headers = {
    Authorization: `Bearer ${input.secretKey}`,
    "Provider-Config-Key": input.providerConfigKey,
    "Connection-Id": input.connectionId,
    Accept: "application/json",
  };
  try {
    const url = new URL(
      `/connections/${encodeURIComponent(input.connectionId)}`,
      origin,
    );
    url.searchParams.set("provider_config_key", input.providerConfigKey);
    const response = await fetchImpl(url, {
      headers,
      redirect: "error",
      ...(input.signal ? { signal: input.signal } : {}),
    });
    // Missing is definitive only in the caller's explicitly selected backend environment.
    if (response.status === 404)
      return {
        ...result("inactive", "connection_missing"),
        upstreamConnected: false,
      };
    if (!response.ok)
      return {
        ...result(
          "unknown",
          response.status === 429 ? "rate_limited" : "backend_unavailable",
        ),
        upstreamConnected: null,
      };
    const payload = object(await response.json());
    const connection = object(payload.connection ?? payload.data ?? payload);
    if (
      connection.connection_id !== input.connectionId ||
      connection.provider_config_key !== input.providerConfigKey
    )
      return {
        ...result("unknown", "unexpected_response"),
        upstreamConnected: null,
      };
    const provider =
      input.provider ??
      (typeof connection.provider === "string" ? connection.provider : "");
    const authMode = String(object(connection.credentials).type ?? "");
    const health = await verifyProviderAuthorization({
      provider,
      authMode,
      transport: (request) => {
        const target = new URL(request.url);
        // Use Nango's documented /proxy/{path} protocol. Backend credentials never go upstream directly.
        const proxy = new URL(
          `/proxy${target.pathname}${target.search}`,
          origin,
        );
        return fetchImpl(proxy, {
          method: request.method,
          redirect: "error",
          headers: {
            ...headers,
            ...(target.hostname === "api.telegram.org"
              ? {}
              : { "Base-Url-Override": target.origin }),
            "Nango-Proxy-Content-Type": "application/json",
            "Nango-Proxy-Notion-Version": "2022-06-28",
          },
          ...(request.body ? { body: request.body } : {}),
          ...(input.signal ? { signal: input.signal } : {}),
        });
      },
    });
    // A successful current provider check supersedes stale auth errors; sync errors are independent.
    return {
      ...health,
      ...(input.signal?.aborted
        ? {
            authorizationStatus: "unknown" as const,
            authorizationReason: "check_timed_out",
          }
        : {}),
      upstreamConnected: true,
      ...(authMode ? { authMode } : {}),
    };
  } catch {
    return {
      ...result(
        "unknown",
        input.signal?.aborted ? "check_timed_out" : "backend_unavailable",
      ),
      upstreamConnected: null,
    };
  }
}
export { AuthorizationProbeQueue } from "./queue.js";
