export class N8nProviderError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "N8nProviderError";
  }
}

export class N8nConfigurationError extends N8nProviderError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "N8nConfigurationError";
  }
}

export class N8nApiError extends N8nProviderError {
  readonly status?: number;
  readonly path: string;
  readonly responseBody?: unknown;

  constructor(
    message: string,
    options: {
      path: string;
      status?: number;
      responseBody?: unknown;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = "N8nApiError";
    this.path = options.path;
    this.status = options.status;
    this.responseBody = options.responseBody;
  }
}

export class N8nCredentialTokenError extends N8nProviderError {
  readonly credentialId: string;
  readonly credentialType?: string;

  constructor(message: string, credentialId: string, credentialType?: string) {
    super(message);
    this.name = "N8nCredentialTokenError";
    this.credentialId = credentialId;
    this.credentialType = credentialType;
  }
}

export class N8nWebhookError extends N8nProviderError {
  readonly payload?: unknown;

  constructor(message: string, payload?: unknown) {
    super(message);
    this.name = "N8nWebhookError";
    this.payload = payload;
  }
}
