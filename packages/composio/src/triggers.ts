import { listConnectedAccounts } from "./accounts";
import type {
  ComposioApiRequester,
  ComposioListResponse,
  ComposioTrigger,
  ComposioTriggerSubscription,
  JsonObject,
  ListActiveSubscriptionsOptions,
  ListTriggersOptions,
  SubscribeTriggerOptions,
} from "./types";

export async function listTriggers(
  request: ComposioApiRequester,
  opts: ListTriggersOptions = {},
): Promise<ComposioListResponse<ComposioTrigger>> {
  return request<ComposioListResponse<ComposioTrigger>>({
    path: "triggers_types",
    query: {
      ...(opts.appName ? { toolkit_slugs: [opts.appName] } : {}),
      ...(opts.cursor ? { cursor: opts.cursor } : {}),
      ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
    },
  });
}

export async function subscribeTrigger(
  request: ComposioApiRequester,
  triggerId: string,
  entityId: string,
  config: JsonObject,
  opts: SubscribeTriggerOptions = {},
): Promise<ComposioTriggerSubscription> {
  const connectedAccountId = opts.connectedAccountId ?? (await resolveConnectedAccountId(request, triggerId, entityId));

  return request<ComposioTriggerSubscription>({
    method: "POST",
    path: `trigger_instances/${encodeURIComponent(triggerId)}/upsert`,
    body: {
      connected_account_id: connectedAccountId,
      trigger_config: config,
    },
  });
}

export async function unsubscribeTrigger(
  request: ComposioApiRequester,
  subscriptionId: string,
): Promise<void> {
  await request({
    method: "DELETE",
    path: `trigger_instances/manage/${encodeURIComponent(subscriptionId)}`,
  });
}

export async function listActiveSubscriptions(
  request: ComposioApiRequester,
  opts: ListActiveSubscriptionsOptions = {},
): Promise<ComposioListResponse<ComposioTriggerSubscription>> {
  return request<ComposioListResponse<ComposioTriggerSubscription>>({
    path: "trigger_instances/active",
    query: {
      ...(opts.entityId ? { user_ids: [opts.entityId] } : {}),
      ...(opts.includeDisabled ? { show_disabled: true } : {}),
      ...(opts.cursor ? { cursor: opts.cursor } : {}),
      ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
    },
  });
}

async function resolveConnectedAccountId(
  request: ComposioApiRequester,
  triggerId: string,
  entityId: string,
): Promise<string> {
  const trigger = await request<ComposioTrigger>({
    path: `triggers_types/${encodeURIComponent(triggerId)}`,
  });
  const toolkitSlug = trigger.toolkit?.slug;
  const accounts = await listConnectedAccounts(request, {
    entityId,
    ...(toolkitSlug ? { appName: toolkitSlug } : {}),
    limit: 1,
  });
  const connectedAccountId = accounts.items[0]?.id;

  if (!connectedAccountId) {
    throw new Error(
      `No connected account found for entity "${entityId}"${toolkitSlug ? ` and app "${toolkitSlug}"` : ""}.`,
    );
  }

  return connectedAccountId;
}
