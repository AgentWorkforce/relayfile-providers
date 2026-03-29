import type {
  ClerkApiClient,
  ClerkDeletedObject,
  ClerkExternalAccount,
  ClerkListUsersOptions,
  ClerkOAuthToken,
  ClerkPaginatedResponse,
  ClerkUpdateUserData,
  ClerkUser,
} from "./types.js";
import { normalizePaginatedResponse } from "./pagination.js";

export async function listUsers(
  client: ClerkApiClient,
  options: ClerkListUsersOptions = {},
): Promise<ClerkPaginatedResponse<ClerkUser>> {
  const response = await client.request<unknown>({
    method: "GET",
    path: "/v1/users",
    query: {
      limit: options.limit,
      offset: options.offset,
      emailAddress: options.emailAddress ?? options.email,
      query: options.query,
      orderBy: options.orderBy,
    },
  });

  return normalizePaginatedResponse<ClerkUser>(response);
}

export async function getUser(client: ClerkApiClient, userId: string): Promise<ClerkUser> {
  return client.request<ClerkUser>({
    method: "GET",
    path: `/v1/users/${encodeURIComponent(userId)}`,
  });
}

export async function updateUser(
  client: ClerkApiClient,
  userId: string,
  data: ClerkUpdateUserData,
): Promise<ClerkUser> {
  return client.request<ClerkUser>({
    method: "PATCH",
    path: `/v1/users/${encodeURIComponent(userId)}`,
    body: data,
  });
}

export async function deleteUser(
  client: ClerkApiClient,
  userId: string,
): Promise<ClerkDeletedObject> {
  return client.request<ClerkDeletedObject>({
    method: "DELETE",
    path: `/v1/users/${encodeURIComponent(userId)}`,
  });
}

export async function getUserExternalAccounts(
  client: ClerkApiClient,
  userId: string,
): Promise<ClerkExternalAccount[]> {
  const user = await getUser(client, userId);
  return user.externalAccounts ?? user.external_accounts ?? [];
}

export async function getOAuthTokenList(
  client: ClerkApiClient,
  userId: string,
  provider: string,
): Promise<ClerkPaginatedResponse<ClerkOAuthToken>> {
  const response = await client.request<unknown>({
    method: "GET",
    path: `/v1/users/${encodeURIComponent(userId)}/oauth_access_tokens/${encodeURIComponent(provider)}`,
  });

  return normalizePaginatedResponse<ClerkOAuthToken>(response);
}

export async function getOAuthToken(
  client: ClerkApiClient,
  userId: string,
  provider: string,
): Promise<ClerkOAuthToken | null> {
  const response = await getOAuthTokenList(client, userId, provider);
  return response.data[0] ?? null;
}
