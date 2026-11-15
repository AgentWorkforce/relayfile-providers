/** Safe presentation fields from a connected account; credentials never escape. */
export type ComposioAuthorizationStatus = "active" | "inactive" | "unknown";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

export function composioAuthorizationStatus(account: Record<string, unknown>): ComposioAuthorizationStatus {
  const config = record(account.auth_config);
  if (account.is_disabled === true || config?.is_disabled === true) return "inactive";
  const value = account.status ?? record(record(account.state)?.val)?.status;
  const status = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (["ACTIVE", "AUTHORIZED", "CONNECTED", "ENABLED", "READY", "SUCCESS"].includes(status)) return "active";
  if (["INACTIVE", "EXPIRED", "DISABLED", "FAILED", "REVOKED"].includes(status)) return "inactive";
  return "unknown";
}

const AUTH_MODES = new Set(["OAUTH2", "OAUTH1", "API_KEY", "BASIC", "APP", "JWT", "MCP_OAUTH2_GENERIC"]);
/** Read only the documented scheme, never account.state.val credentials. */
export function composioAuthMode(account: Record<string, unknown>): string | null {
  const scheme = account.authScheme ?? record(account.auth_config)?.auth_scheme;
  return typeof scheme === "string" && AUTH_MODES.has(scheme.toUpperCase()) ? scheme.toUpperCase() : null;
}
