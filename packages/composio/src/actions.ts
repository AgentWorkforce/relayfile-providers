import type {
  ComposioAction,
  ComposioActionExecutionResponse,
  ComposioApiRequester,
  ComposioListResponse,
  ExecuteActionOptions,
  JsonObject,
  ListActionsOptions,
} from "./types";

export async function listActions(
  request: ComposioApiRequester,
  opts: ListActionsOptions = {},
): Promise<ComposioListResponse<ComposioAction>> {
  const response = await request<ComposioListResponse<ComposioAction>>({
    path: "tools",
    query: {
      ...(opts.appName ? { toolkit_slugs: [opts.appName] } : {}),
      ...(opts.search ? { search: opts.search } : {}),
      ...(opts.cursor ? { cursor: opts.cursor } : {}),
      ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
    },
  });

  if (!opts.tags || opts.tags.length === 0) {
    return response;
  }

  const tagSet = new Set(opts.tags.map((tag) => tag.toLowerCase()));
  return {
    ...response,
    items: response.items.filter((action) => {
      const actionTags = action.tags ?? [];
      return actionTags.some((tag) => tagSet.has(tag.toLowerCase()));
    }),
  };
}

export async function getAction(
  request: ComposioApiRequester,
  actionId: string,
): Promise<ComposioAction> {
  return request<ComposioAction>({
    path: `tools/${encodeURIComponent(actionId)}`,
  });
}

export async function executeAction<TData = unknown>(
  request: ComposioApiRequester,
  actionId: string,
  entityId: string,
  params: JsonObject,
  opts: ExecuteActionOptions = {},
): Promise<ComposioActionExecutionResponse<TData>> {
  return request<ComposioActionExecutionResponse<TData>>({
    method: "POST",
    path: `tools/execute/${encodeURIComponent(actionId)}`,
    body: {
      user_id: entityId,
      arguments: params,
      ...(opts.connectedAccountId ? { connected_account_id: opts.connectedAccountId } : {}),
      ...(opts.version ? { version: opts.version } : {}),
      ...(opts.text ? { text: opts.text } : {}),
    },
  });
}
