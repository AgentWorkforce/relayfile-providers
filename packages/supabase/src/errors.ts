/** Error thrown when webhook normalization fails. */
export class WebhookNormalizationError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown> | undefined;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "WebhookNormalizationError";
    this.code = code;
    this.details = details;
  }
}
