import { deleteConnectedAccount, listConnectedAccounts } from "./accounts";
import { listActiveSubscriptions, unsubscribeTrigger } from "./triggers";
import type {
  ComposioApiRequester,
  ComposioConnectedAccount,
  ComposioEntity,
  ComposioEntityInput,
  ComposioListResponse,
  ComposioTriggerSubscription,
} from "./types";

export async function listEntities(
  request: ComposioApiRequester,
): Promise<ComposioEntity[]> {
  const accounts = await collectAllPages<ComposioConnectedAccount>(request, {
    path: "connected_accounts",
    limit: 100,
  });
  const subscriptions = await collectAllPages<ComposioTriggerSubscription>(request, {
    path: "trigger_instances/active",
    limit: 100,
    includeDisabled: true,
  });

  const entityIds = new Set<string>();

  for (const account of accounts) {
    if (account.user_id) {
      entityIds.add(account.user_id);
    }
  }

  for (const subscription of subscriptions) {
    if (subscription.user_id) {
      entityIds.add(subscription.user_id);
    }
  }

  return [...entityIds]
    .sort((left, right) => left.localeCompare(right))
    .map((entityId) => buildEntity(entityId, accounts, subscriptions));
}

export async function getEntity(
  request: ComposioApiRequester,
  entityId: string,
): Promise<ComposioEntity> {
  const accounts = await listConnectedAccounts(request, { entityId, limit: 100 });
  const subscriptions = await listActiveSubscriptions(request, { entityId, includeDisabled: true, limit: 100 });

  return buildEntity(entityId, accounts.items, subscriptions.items);
}

export async function createEntity(
  _request: ComposioApiRequester,
  data: ComposioEntityInput,
): Promise<ComposioEntity> {
  const entityId = data.id.trim();
  if (entityId.length === 0) {
    throw new Error("Composio entity helpers require a non-empty entity id.");
  }

  return {
    id: entityId,
    connectedAccountIds: [],
    activeSubscriptionIds: [],
  };
}

export async function deleteEntity(
  request: ComposioApiRequester,
  entityId: string,
): Promise<void> {
  const accounts = await listConnectedAccounts(request, { entityId, limit: 100 });
  const subscriptions = await listActiveSubscriptions(request, { entityId, includeDisabled: true, limit: 100 });

  await Promise.all(
    subscriptions.items.map(async (subscription) => {
      await unsubscribeTrigger(request, subscription.id);
    }),
  );
  await Promise.all(
    accounts.items.map(async (account) => {
      await deleteConnectedAccount(request, account.id);
    }),
  );
}

function buildEntity(
  entityId: string,
  accounts: readonly ComposioConnectedAccount[],
  subscriptions: readonly ComposioTriggerSubscription[],
): ComposioEntity {
  return {
    id: entityId,
    connectedAccountIds: accounts
      .filter((account) => account.user_id === entityId)
      .map((account) => account.id),
    activeSubscriptionIds: subscriptions
      .filter((subscription) => subscription.user_id === entityId)
      .map((subscription) => subscription.id),
  };
}

async function collectAllPages<TItem>(
  request: ComposioApiRequester,
  options: {
    path: string;
    limit: number;
    includeDisabled?: boolean;
  },
): Promise<TItem[]> {
  const items: TItem[] = [];
  let cursor: string | undefined;

  do {
    const response = await request<ComposioListResponse<TItem>>({
      path: options.path,
      query: {
        limit: options.limit,
        ...(cursor ? { cursor } : {}),
        ...(options.includeDisabled ? { show_disabled: true } : {}),
      },
    });

    items.push(...response.items);
    cursor =
      typeof response.next_cursor === "string"
        ? response.next_cursor
        : typeof response.nextCursor === "string"
          ? response.nextCursor
          : undefined;
  } while (cursor);

  return items;
}
