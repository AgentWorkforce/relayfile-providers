import type {
  ComposioApiRequester,
  ComposioConnectedAccount,
  ComposioConnectionRequest,
  ComposioListResponse,
  InitiateConnectionOptions,
  ListConnectedAccountsOptions,
} from "./types";

export async function listConnectedAccounts(
  request: ComposioApiRequester,
  opts: ListConnectedAccountsOptions = {},
): Promise<ComposioListResponse<ComposioConnectedAccount>> {
  return request<ComposioListResponse<ComposioConnectedAccount>>({
    path: "connected_accounts",
    query: {
      ...(opts.entityId ? { user_ids: [opts.entityId] } : {}),
      ...(opts.integrationId ? { auth_config_ids: [opts.integrationId] } : {}),
      ...(opts.appName ? { toolkit_slugs: [opts.appName] } : {}),
      ...(opts.statuses && opts.statuses.length > 0 ? { statuses: opts.statuses } : {}),
      ...(opts.cursor ? { cursor: opts.cursor } : {}),
      ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
    },
  });
}

export async function getConnectedAccount(
  request: ComposioApiRequester,
  accountId: string,
): Promise<ComposioConnectedAccount> {
  return request<ComposioConnectedAccount>({
    path: `connected_accounts/${encodeURIComponent(accountId)}`,
  });
}

export async function initiateConnection(
  request: ComposioApiRequester,
  entityId: string,
  integrationId: string,
  opts: InitiateConnectionOptions = {},
): Promise<ComposioConnectionRequest> {
  return request<ComposioConnectionRequest>({
    method: "POST",
    path: "connected_accounts/link",
    body: {
      auth_config_id: integrationId,
      user_id: entityId,
      ...(opts.callbackUrl ? { callback_url: opts.callbackUrl } : {}),
      ...(opts.connectionData ? { connection_data: opts.connectionData } : {}),
    },
  });
}

export async function deleteConnectedAccount(
  request: ComposioApiRequester,
  accountId: string,
): Promise<void> {
  await request({
    method: "DELETE",
    path: `connected_accounts/${encodeURIComponent(accountId)}`,
  });
}
