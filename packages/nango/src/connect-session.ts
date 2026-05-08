import type {
  NangoConnectSessionInput,
  NangoConnectSessionResult,
  NangoConnectionServiceConfig,
  JsonObject,
} from "./types.js";

export async function createNangoConnectSession(
  config: NangoConnectionServiceConfig,
  input: NangoConnectSessionInput,
): Promise<NangoConnectSessionResult> {
  const secretKey = config.secretKey.trim();
  if (!secretKey) {
    throw new Error("A Nango secretKey is required.");
  }

  const response = await getFetch(config)(new URL("/connect/sessions", `${normalizeBaseUrl(config.baseUrl)}/`), {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${secretKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      end_user: {
        id: input.endUserId,
        ...(input.endUserEmail ? { email: input.endUserEmail } : {}),
        ...(input.endUserTags ? { tags: input.endUserTags } : {}),
      },
      ...(input.tags ? { tags: input.tags } : {}),
      ...(input.allowedIntegrations && input.allowedIntegrations.length > 0
        ? { allowed_integrations: [...input.allowedIntegrations] }
        : {}),
    }),
  });

  const payload = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(`Nango connect session request failed: ${response.status} ${response.statusText}`);
  }

  const data = unwrapData(payload) as {
    token?: unknown;
    expires_at?: unknown;
    expiresAt?: unknown;
    connect_link?: unknown;
    connectLink?: unknown;
    connection_id?: unknown;
    connectionId?: unknown;
  };

  return {
    token: requireString(data.token, "token"),
    expiresAt: requireString(data.expires_at ?? data.expiresAt, "expiresAt"),
    connectLink: requireString(data.connect_link ?? data.connectLink, "connectLink"),
    connectionId: optionalString(data.connection_id ?? data.connectionId),
    raw: data as JsonObject,
  };
}

function normalizeBaseUrl(baseUrl = "https://api.nango.dev"): string {
  return baseUrl.replace(/\/+$/, "");
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Nango connect session response is missing ${field}.`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function getFetch(config: NangoConnectionServiceConfig): typeof fetch {
  return config.fetch ?? fetch;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const raw = await response.text();
  if (!raw) {
    return {};
  }
  return JSON.parse(raw) as unknown;
}

function unwrapData(payload: unknown): unknown {
  if (
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    "data" in payload &&
    (payload as Record<string, unknown>).data &&
    typeof (payload as Record<string, unknown>).data === "object"
  ) {
    return (payload as Record<string, unknown>).data;
  }

  return payload;
}
