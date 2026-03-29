import {
  deleteConnectedAccount,
  getConnectedAccount,
  initiateConnection,
  listConnectedAccounts,
} from "./accounts";
import { executeAction, getAction, listActions } from "./actions";
import { createComposioApiRequester } from "./client";
import { createEntity, deleteEntity, getEntity, listEntities } from "./entities";
import { getIntegration, listApps, listIntegrations } from "./integrations";
import {
  checkComposioConnectionHealth,
  lookupActionForRequest,
  proxyThroughComposio,
  resolveComposioProviderConfig,
} from "./proxy";
import {
  listActiveSubscriptions,
  listTriggers,
  subscribeTrigger,
  unsubscribeTrigger,
} from "./triggers";
import { normalizeComposioWebhook } from "./webhook";
import type {
  ComposioAction,
  ComposioActionLookupResult,
  ComposioActionExecutionResponse,
  ComposioApiRequester,
  ComposioApp,
  ComposioConnectedAccount,
  ComposioConnectionRequest,
  ComposioEntity,
  ComposioEntityInput,
  ComposioIntegration,
  ComposioListResponse,
  ComposioProviderConfig,
  ComposioTrigger,
  ComposioTriggerSubscription,
  ConnectionProvider,
  ExecuteActionOptions,
  InitiateConnectionOptions,
  JsonObject,
  ListActionsOptions,
  ListActiveSubscriptionsOptions,
  ListAppsOptions,
  ListConnectedAccountsOptions,
  ListIntegrationsOptions,
  ListTriggersOptions,
  NormalizedWebhook,
  ProxyRequest,
  ProxyResponse,
  ResolvedComposioProviderConfig,
  SubscribeTriggerOptions,
} from "./types";

export class ComposioProvider implements ConnectionProvider {
  readonly name = "composio";
  readonly config: Readonly<ResolvedComposioProviderConfig>;
  private readonly request: ComposioApiRequester;

  constructor(config: ComposioProviderConfig) {
    this.config = resolveComposioProviderConfig(config);
    this.request = createComposioApiRequester(this.config);
  }

  get apiKey(): string {
    return this.config.apiKey;
  }

  get baseUrl(): string {
    return this.config.baseUrl;
  }

  get defaultToolset() {
    return this.config.defaultToolset;
  }

  async proxy(request: ProxyRequest): Promise<ProxyResponse> {
    return proxyThroughComposio(this.config, request);
  }

  async healthCheck(connectionId: string): Promise<boolean> {
    return checkComposioConnectionHealth(this.config, connectionId);
  }

  async handleWebhook(rawPayload: unknown): Promise<NormalizedWebhook> {
    return normalizeComposioWebhook(rawPayload);
  }

  async lookupAction(request: ProxyRequest): Promise<ComposioActionLookupResult> {
    return lookupActionForRequest(this.config, request);
  }

  async listEntities(): Promise<ComposioEntity[]> {
    return listEntities(this.request);
  }

  async getEntity(entityId: string): Promise<ComposioEntity> {
    return getEntity(this.request, entityId);
  }

  async createEntity(data: ComposioEntityInput): Promise<ComposioEntity> {
    return createEntity(this.request, data);
  }

  async deleteEntity(entityId: string): Promise<void> {
    await deleteEntity(this.request, entityId);
  }

  async listConnectedAccounts(
    opts: ListConnectedAccountsOptions = {},
  ): Promise<ComposioListResponse<ComposioConnectedAccount>> {
    return listConnectedAccounts(this.request, opts);
  }

  async getConnectedAccount(accountId: string): Promise<ComposioConnectedAccount> {
    return getConnectedAccount(this.request, accountId);
  }

  async initiateConnection(
    entityId: string,
    integrationId: string,
    opts: InitiateConnectionOptions = {},
  ): Promise<ComposioConnectionRequest> {
    return initiateConnection(this.request, entityId, integrationId, opts);
  }

  async deleteConnectedAccount(accountId: string): Promise<void> {
    await deleteConnectedAccount(this.request, accountId);
  }

  async listActions(opts: ListActionsOptions = {}): Promise<ComposioListResponse<ComposioAction>> {
    return listActions(this.request, opts);
  }

  async getAction(actionId: string): Promise<ComposioAction> {
    return getAction(this.request, actionId);
  }

  async executeAction<TData = unknown>(
    actionId: string,
    entityId: string,
    params: JsonObject,
    opts: ExecuteActionOptions = {},
  ): Promise<ComposioActionExecutionResponse<TData>> {
    return executeAction<TData>(this.request, actionId, entityId, params, opts);
  }

  async listTriggers(opts: ListTriggersOptions = {}): Promise<ComposioListResponse<ComposioTrigger>> {
    return listTriggers(this.request, opts);
  }

  async subscribeTrigger(
    triggerId: string,
    entityId: string,
    config: JsonObject,
    opts: SubscribeTriggerOptions = {},
  ): Promise<ComposioTriggerSubscription> {
    return subscribeTrigger(this.request, triggerId, entityId, config, opts);
  }

  async unsubscribeTrigger(subscriptionId: string): Promise<void> {
    await unsubscribeTrigger(this.request, subscriptionId);
  }

  async listActiveSubscriptions(
    opts: ListActiveSubscriptionsOptions = {},
  ): Promise<ComposioListResponse<ComposioTriggerSubscription>> {
    return listActiveSubscriptions(this.request, opts);
  }

  async listIntegrations(
    opts: ListIntegrationsOptions = {},
  ): Promise<ComposioListResponse<ComposioIntegration>> {
    return listIntegrations(this.request, opts);
  }

  async getIntegration(integrationId: string): Promise<ComposioIntegration> {
    return getIntegration(this.request, integrationId);
  }

  async listApps(opts: ListAppsOptions = {}): Promise<ComposioListResponse<ComposioApp>> {
    return listApps(this.request, opts);
  }
}

export function createComposioProvider(config: ComposioProviderConfig): ComposioProvider {
  return new ComposioProvider(config);
}
