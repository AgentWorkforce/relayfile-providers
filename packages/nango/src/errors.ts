import type {
  NangoRefreshResponse,
  ProxyFailureResponse,
  ProxyResponseData,
  ProxyResponseHeaders,
} from "./types.js";

export type NangoErrorCode =
  | "CONFIGURATION_ERROR"
  | "NOT_IMPLEMENTED"
  | "PROXY_CONFIG_ERROR"
  | "PROXY_FAILURE_ERROR"
  | "PROXY_TRANSPORT_ERROR"
  | "CONNECTION_ERROR"
  | "WEBHOOK_ERROR"
  | "REFRESH_HTTP_ERROR"
  | "REFRESH_NETWORK_ERROR"
  | "REFRESH_REJECTED_ERROR"
  | "REFRESH_RESPONSE_ERROR";

export interface NangoErrorOptions {
  code?: NangoErrorCode | string;
  cause?: unknown;
}

export interface NangoProxyErrorOptions extends NangoErrorOptions {
  status?: number;
  endpoint?: string;
  connectionId?: string;
  url?: string;
}

export interface NangoWebhookErrorOptions extends NangoErrorOptions {
  payload?: unknown;
}

export class NangoProviderError extends Error {
  readonly code: NangoErrorCode | string;
  readonly cause: unknown;

  constructor(message: string, options: NangoErrorOptions = {}) {
    super(message);
    this.name = new.target.name;
    this.code = options.code ?? "CONNECTION_ERROR";
    this.cause = options.cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NangoConfigurationError extends NangoProviderError {
  constructor(message: string, options: NangoErrorOptions = {}) {
    super(message, {
      code: options.code ?? "CONFIGURATION_ERROR",
      cause: options.cause,
    });
  }
}

export class NangoProxyError extends NangoProviderError {
  readonly status: number | undefined;
  readonly endpoint: string | undefined;
  readonly connectionId: string | undefined;
  readonly url: string | undefined;

  constructor(message: string, options: NangoProxyErrorOptions = {}) {
    super(message, {
      code: options.code ?? "PROXY_TRANSPORT_ERROR",
      cause: options.cause,
    });
    this.status = options.status;
    this.endpoint = options.endpoint;
    this.connectionId = options.connectionId;
    this.url = options.url;
  }
}

export class NangoProxyConfigError extends NangoConfigurationError {
  constructor(message: string, options: NangoErrorOptions = {}) {
    super(message, {
      code: options.code ?? "PROXY_CONFIG_ERROR",
      cause: options.cause,
    });
  }
}

export class NangoProxyTransportError extends NangoProxyError {
  readonly url: string;

  constructor(url: string, cause: unknown, options: Omit<NangoProxyErrorOptions, "cause" | "url"> = {}) {
    super(`Nango proxy transport failed for ${url}.`, buildProxyErrorOptions({
      status: options.status,
      endpoint: options.endpoint,
      connectionId: options.connectionId,
      code: "PROXY_TRANSPORT_ERROR",
      cause,
      url,
    }));
    this.url = url;
  }
}

export class NangoProxyFailureError<
  TData = ProxyResponseData,
> extends NangoProxyError {
  readonly response: ProxyFailureResponse<TData>;

  constructor(response: ProxyFailureResponse<TData>, options: NangoProxyErrorOptions = {}) {
    super(
      buildProxyFailureMessage(response.status, options.endpoint, options.connectionId),
      buildProxyErrorOptions({
        status: options.status ?? response.status,
        endpoint: options.endpoint,
        connectionId: options.connectionId,
        code: options.code ?? "PROXY_FAILURE_ERROR",
        cause: options.cause,
        url: options.url,
      }),
    );
    this.response = response;
  }
}

export class NangoConnectionError extends NangoProviderError {
  readonly connectionId: string | undefined;

  constructor(message: string, connectionId?: string, options: NangoErrorOptions = {}) {
    super(message, {
      code: options.code ?? "CONNECTION_ERROR",
      cause: options.cause,
    });
    this.connectionId = connectionId;
  }
}

export class NangoWebhookError extends NangoProviderError {
  readonly payload: unknown;

  constructor(message: string, payloadOrOptions?: unknown, options: NangoErrorOptions = {}) {
    const resolvedOptions = isWebhookOptions(payloadOrOptions) ? payloadOrOptions : options;
    super(message, {
      code: resolvedOptions.code ?? "WEBHOOK_ERROR",
      cause: resolvedOptions.cause,
    });
    this.payload = isWebhookOptions(payloadOrOptions) ? payloadOrOptions.payload : payloadOrOptions;
  }
}

export class NangoRefreshNetworkError extends NangoProviderError {
  readonly endpoint: string;

  constructor(endpoint: string, cause: unknown) {
    super(`Nango refresh request failed for ${endpoint}.`, {
      code: "REFRESH_NETWORK_ERROR",
      cause,
    });
    this.endpoint = endpoint;
  }
}

export class NangoRefreshHttpError extends NangoProviderError {
  readonly endpoint: string;
  readonly status: number;
  readonly responseBody: unknown;

  constructor(endpoint: string, status: number, responseBody: unknown) {
    super(`Nango refresh request failed for ${endpoint} with status ${status}.`, {
      code: "REFRESH_HTTP_ERROR",
    });
    this.endpoint = endpoint;
    this.status = status;
    this.responseBody = responseBody;
  }
}

export class NangoRefreshResponseError extends NangoProviderError {
  readonly endpoint: string;
  readonly responseBody: unknown;

  constructor(endpoint: string, responseBody: unknown) {
    super(`Nango refresh response from ${endpoint} did not match the expected shape.`, {
      code: "REFRESH_RESPONSE_ERROR",
    });
    this.endpoint = endpoint;
    this.responseBody = responseBody;
  }
}

export class NangoRefreshRejectedError extends NangoProviderError {
  readonly endpoint: string;
  readonly responseBody: NangoRefreshResponse;

  constructor(endpoint: string, responseBody: NangoRefreshResponse) {
    super(`Nango rejected the refresh request for ${endpoint}.`, {
      code: "REFRESH_REJECTED_ERROR",
    });
    this.endpoint = endpoint;
    this.responseBody = responseBody;
  }
}

export function isNangoProxyError(
  error: unknown,
): error is NangoProxyConfigError | NangoProxyFailureError | NangoProxyTransportError {
  return (
    error instanceof NangoProxyConfigError ||
    error instanceof NangoProxyFailureError ||
    error instanceof NangoProxyTransportError
  );
}

export function isNangoRefreshError(
  error: unknown,
): error is
  | NangoRefreshHttpError
  | NangoRefreshNetworkError
  | NangoRefreshRejectedError
  | NangoRefreshResponseError {
  return (
    error instanceof NangoRefreshHttpError ||
    error instanceof NangoRefreshNetworkError ||
    error instanceof NangoRefreshRejectedError ||
    error instanceof NangoRefreshResponseError
  );
}

function isWebhookOptions(value: unknown): value is NangoWebhookErrorOptions {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    ("payload" in value || "cause" in value || "code" in value)
  );
}

function buildProxyFailureMessage(status: number, endpoint?: string, connectionId?: string): string {
  const target = endpoint ?? "unknown endpoint";
  const connectionSuffix = connectionId ? ` for connection ${connectionId}` : "";
  return `Nango proxy request to ${target} failed with status ${status}${connectionSuffix}.`;
}

function buildProxyErrorOptions(options: {
  status: number | undefined;
  endpoint: string | undefined;
  connectionId: string | undefined;
  code: NangoErrorCode | string;
  cause: unknown | undefined;
  url: string | undefined;
}): NangoProxyErrorOptions {
  return {
    ...(options.status === undefined ? {} : { status: options.status }),
    ...(options.endpoint === undefined ? {} : { endpoint: options.endpoint }),
    ...(options.connectionId === undefined ? {} : { connectionId: options.connectionId }),
    ...(options.url === undefined ? {} : { url: options.url }),
    ...(options.cause === undefined ? {} : { cause: options.cause }),
    code: options.code,
  };
}
