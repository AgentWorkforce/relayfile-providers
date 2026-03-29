import type {
  PipedreamConfig,
  PipedreamEnvironment,
  PipedreamOAuthTokenResponse,
} from "./types.js";

const DEFAULT_BASE_URL = "https://api.pipedream.com";
const DEFAULT_SCOPE = "*";
const DEFAULT_SKEW_MS = 30_000;

export class PipedreamAuthSession {
  private cachedToken?: string;
  private expiresAt = 0;
  private inFlight?: Promise<string>;

  readonly baseUrl: string;
  readonly environment: PipedreamEnvironment;
  readonly fetchImpl: typeof fetch;

  constructor(private readonly config: PipedreamConfig) {
    this.baseUrl = normalizeBaseUrl(config.baseUrl);
    this.environment = config.environment ?? "production";
    this.fetchImpl = config.fetch ?? fetch;
  }

  async getBearerToken(signal?: AbortSignal): Promise<string> {
    const now = Date.now();
    const skewMs = this.config.tokenRefreshSkewMs ?? DEFAULT_SKEW_MS;

    if (this.cachedToken && now < this.expiresAt - skewMs) {
      return this.cachedToken;
    }

    if (!this.inFlight) {
      this.inFlight = this.refresh(signal).finally(() => {
        this.inFlight = undefined;
      });
    }

    return this.inFlight;
  }

  invalidate(): void {
    this.cachedToken = undefined;
    this.expiresAt = 0;
  }

  private async refresh(signal?: AbortSignal): Promise<string> {
    const response = await this.fetchImpl(`${this.baseUrl}/v1/oauth/token`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        scope: this.config.tokenScope ?? DEFAULT_SCOPE,
      }),
      signal,
    });

    const payload = (await response.json()) as Partial<PipedreamOAuthTokenResponse>;
    if (!response.ok || typeof payload.access_token !== "string") {
      throw new Error(
        `Failed to create Pipedream OAuth token (${response.status}).`
      );
    }

    const expiresIn =
      typeof payload.expires_in === "number" && Number.isFinite(payload.expires_in)
        ? payload.expires_in
        : 3600;

    this.cachedToken = payload.access_token;
    this.expiresAt = Date.now() + expiresIn * 1000;
    return payload.access_token;
  }
}

export function normalizeBaseUrl(baseUrl?: string): string {
  const trimmed = baseUrl?.trim();
  return (trimmed && trimmed.length > 0 ? trimmed : DEFAULT_BASE_URL).replace(
    /\/+$/,
    ""
  );
}
