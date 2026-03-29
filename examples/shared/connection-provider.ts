import type {
  ConnectionProvider,
  NormalizedWebhook,
  ProxyRequest,
  ProxyResponse,
} from "@relayfile/sdk";

type ProviderLike = {
  name: string;
  proxy(request: unknown): Promise<{
    status: number;
    headers: Record<string, string>;
    data: unknown;
  }>;
  healthCheck(connectionId: string): Promise<boolean>;
  handleWebhook?(rawPayload: unknown): Promise<NormalizedWebhook>;
};

export function asConnectionProvider(provider: ProviderLike): ConnectionProvider {
  return {
    name: provider.name,
    proxy(request: ProxyRequest): Promise<ProxyResponse> {
      return provider.proxy(request);
    },
    healthCheck(connectionId: string): Promise<boolean> {
      return provider.healthCheck(connectionId);
    },
    ...(provider.handleWebhook
      ? {
          handleWebhook(rawPayload: unknown): Promise<NormalizedWebhook> {
            return provider.handleWebhook!(rawPayload);
          },
        }
      : {}),
  };
}
