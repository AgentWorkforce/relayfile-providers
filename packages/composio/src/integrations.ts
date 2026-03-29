import type {
  ComposioApiRequester,
  ComposioApp,
  ComposioIntegration,
  ComposioListResponse,
  ListAppsOptions,
  ListIntegrationsOptions,
} from "./types";

export async function listIntegrations(
  request: ComposioApiRequester,
  opts: ListIntegrationsOptions = {},
): Promise<ComposioListResponse<ComposioIntegration>> {
  return request<ComposioListResponse<ComposioIntegration>>({
    path: "auth_configs",
    query: {
      ...(opts.appName ? { toolkit_slug: opts.appName } : {}),
      ...(opts.cursor ? { cursor: opts.cursor } : {}),
      ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
    },
  });
}

export async function getIntegration(
  request: ComposioApiRequester,
  integrationId: string,
): Promise<ComposioIntegration> {
  return request<ComposioIntegration>({
    path: `auth_configs/${encodeURIComponent(integrationId)}`,
  });
}

export async function listApps(
  request: ComposioApiRequester,
  opts: ListAppsOptions = {},
): Promise<ComposioListResponse<ComposioApp>> {
  return request<ComposioListResponse<ComposioApp>>({
    path: "toolkits",
    query: {
      ...(opts.search ? { search: opts.search } : {}),
      ...(opts.category ? { category: opts.category } : {}),
      ...(opts.cursor ? { cursor: opts.cursor } : {}),
      ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
    },
  });
}
