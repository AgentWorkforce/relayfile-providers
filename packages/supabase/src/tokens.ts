import {
  getUser,
  getUserIdentities,
} from "./users.js";
import type {
  GenerateLinkInput,
  GenerateLinkResult,
  GenerateLinkType,
  SupabaseJwtClaims,
  SupabaseSession,
  SupabaseTransport,
  SupabaseUser,
  SupabaseVerifiedSession,
} from "./types.js";

export async function getProviderToken(
  transport: SupabaseTransport,
  userId: string,
  provider: string,
  signal?: AbortSignal,
): Promise<string> {
  const identities = await getUserIdentities(transport, userId, signal);
  const normalizedProvider = provider.trim().toLowerCase();
  const identity = identities.find((item) => item.provider.trim().toLowerCase() === normalizedProvider);
  const token = identity?.identity_data.provider_token;

  if (typeof token !== "string" || token.trim().length === 0) {
    throw new Error(`Supabase identity for provider "${provider}" on user "${userId}" has no provider_token.`);
  }

  return token;
}

export async function refreshSession(
  transport: SupabaseTransport,
  refreshToken: string,
  signal?: AbortSignal,
): Promise<SupabaseSession> {
  const response = await transport.request<SupabaseSession>({
    path: "/token",
    method: "POST",
    query: { grant_type: "refresh_token" },
    authMode: "client",
    body: { refresh_token: refreshToken },
    signal,
  });
  return response.data;
}

export async function generateLink(
  transport: SupabaseTransport,
  type: GenerateLinkType,
  email: string,
  input: GenerateLinkInput = {},
  signal?: AbortSignal,
): Promise<GenerateLinkResult> {
  const response = await transport.request<GenerateLinkResult>({
    path: "/admin/generate_link",
    method: "POST",
    body: compactObject({
      type,
      email,
      redirect_to: input.redirectTo,
      data: input.data,
    }),
    signal,
  });
  return response.data;
}

export async function getSession(
  transport: SupabaseTransport,
  jwt: string,
  signal?: AbortSignal,
): Promise<SupabaseVerifiedSession> {
  const response = await transport.request<unknown>({
    path: "/user",
    authMode: "jwt",
    jwt,
    signal,
  });
  const user = normalizeSessionUser(response.data);
  return {
    jwt,
    claims: decodeJwtClaims(jwt),
    user,
  };
}

export function decodeJwtClaims(jwt: string): SupabaseJwtClaims {
  const parts = jwt.split(".");
  if (parts.length < 2) {
    throw new Error("Invalid JWT.");
  }

  const payload = parts[1];
  if (!payload) {
    throw new Error("Invalid JWT payload.");
  }

  const json = Buffer.from(payload, "base64url").toString("utf8");
  const parsed = JSON.parse(json) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid JWT claims payload.");
  }
  return parsed as SupabaseJwtClaims;
}

function normalizeSessionUser(input: unknown): SupabaseUser {
  const user = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  return getUserShape(user);
}

function getUserShape(input: Record<string, unknown>): SupabaseUser {
  return {
    ...input,
    id: typeof input.id === "string" ? input.id : "",
    app_metadata: toRecord(input.app_metadata),
    user_metadata: toRecord(input.user_metadata),
    identities: Array.isArray(input.identities) ? input.identities as SupabaseUser["identities"] : [],
    ...(Array.isArray(input.factors) ? { factors: input.factors as SupabaseUser["factors"] } : {}),
  };
}

function toRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
}

function compactObject<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as T;
}
