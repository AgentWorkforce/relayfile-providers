import type {
  ClerkApiClient,
  ClerkListSessionsOptions,
  ClerkPaginatedResponse,
  ClerkSession,
  ClerkVerifyTokenOptions,
} from "./types.js";
import { verifyClerkToken } from "./jwt.js";
import { normalizePaginatedResponse } from "./pagination.js";

export async function listSessions(
  client: ClerkApiClient,
  options: ClerkListSessionsOptions = {},
): Promise<ClerkPaginatedResponse<ClerkSession>> {
  const response = await client.request<unknown>({
    method: "GET",
    path: "/v1/sessions",
    query: {
      limit: options.limit,
      offset: options.offset,
      userId: options.userId,
      status: options.status,
      clientId: options.clientId,
    },
  });

  return normalizePaginatedResponse<ClerkSession>(response);
}

export async function getSession(
  client: ClerkApiClient,
  sessionId: string,
): Promise<ClerkSession> {
  return client.request<ClerkSession>({
    method: "GET",
    path: `/v1/sessions/${encodeURIComponent(sessionId)}`,
  });
}

export async function revokeSession(
  client: ClerkApiClient,
  sessionId: string,
): Promise<ClerkSession> {
  return client.request<ClerkSession>({
    method: "POST",
    path: `/v1/sessions/${encodeURIComponent(sessionId)}/revoke`,
  });
}

export async function verifySession(
  client: ClerkApiClient,
  sessionId: string,
  token: string,
  options?: ClerkVerifyTokenOptions,
): Promise<ClerkSession> {
  const payload = await verifyClerkToken(client, token, options);

  if (payload.sid && payload.sid !== sessionId) {
    throw new Error(
      `Session token sid "${payload.sid}" does not match requested session "${sessionId}".`,
    );
  }

  return getSession(client, sessionId);
}
