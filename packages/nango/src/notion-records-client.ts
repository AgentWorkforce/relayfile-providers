export type NangoRecordAction =
  | "ADDED"
  | "UPDATED"
  | "DELETED"
  | "added"
  | "updated"
  | "deleted";

export type NangoRecordMetadata = {
  first_seen_at?: string;
  last_modified_at?: string;
  last_action: NangoRecordAction;
  deleted_at?: string | null;
  pruned_at?: string | null;
  cursor?: string;
};

export type NangoRecord<T = Record<string, unknown>> = T & {
  id?: string | number;
  _nango_metadata: NangoRecordMetadata;
};

export type FetchNangoRecordsArgs = {
  connectionId: string;
  providerConfigKey: string;
  model: string;
  syncName: string;
  modifiedAfter: string;
  nangoBaseUrl: string;
  nangoSecretKey: string;
  signal?: AbortSignal;
  pageSize?: number;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
};

export type FetchNangoRecordsInput = FetchNangoRecordsArgs;

type NangoRecordsPage<T> = {
  records: Array<NangoRecord<T>>;
  next_cursor?: string | null;
};

const DEFAULT_PAGE_SIZE = 100;
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [250, 500, 1_000] as const;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getAbortError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) {
    return signal.reason;
  }

  return new DOMException("The operation was aborted.", "AbortError");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw getAbortError(signal);
  }
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function buildRecordsUrl(
  input: FetchNangoRecordsArgs,
  cursor: string | null,
): URL {
  const url = new URL("/records", `${trimTrailingSlash(input.nangoBaseUrl)}/`);
  url.searchParams.set("model", input.model);
  url.searchParams.set("sync_name", input.syncName);
  url.searchParams.set("modified_after", input.modifiedAfter);
  url.searchParams.set("limit", String(input.pageSize ?? DEFAULT_PAGE_SIZE));
  url.searchParams.set("connection_id", input.connectionId);
  url.searchParams.set("provider_config_key", input.providerConfigKey);

  if (cursor) {
    url.searchParams.set("cursor", cursor);
  }

  return url;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

async function sleepWithAbort(
  ms: number,
  input: FetchNangoRecordsArgs,
): Promise<void> {
  throwIfAborted(input.signal);

  const sleep = input.sleepImpl ?? defaultSleep;
  if (!input.signal) {
    await sleep(ms);
    return;
  }

  await Promise.race([
    sleep(ms),
    new Promise<never>((_resolve, reject) => {
      input.signal?.addEventListener(
        "abort",
        () => reject(getAbortError(input.signal as AbortSignal)),
        { once: true },
      );
    }),
  ]);

  throwIfAborted(input.signal);
}

async function parseResponsePayload(
  response: Response,
): Promise<Record<string, unknown> | null> {
  return (await response.json().catch(() => null)) as
    | Record<string, unknown>
    | null;
}

function getResponseMessage(
  payload: Record<string, unknown> | null,
  response: Response,
): string {
  return (
    readString(payload?.error) ??
    readString(payload?.message) ??
    `${response.status} ${response.statusText}`.trim()
  );
}

async function buildRecordsError(response: Response): Promise<Error> {
  const payload = await parseResponsePayload(response);
  return new Error(
    `Nango records request failed: ${getResponseMessage(payload, response)}`,
  );
}

async function readRecordsPage<T>(response: Response): Promise<NangoRecordsPage<T>> {
  const payload = await parseResponsePayload(response);
  if (!isObject(payload) || !Array.isArray(payload.records)) {
    throw new Error("Nango records request returned an invalid response.");
  }

  const nextCursor =
    typeof payload.next_cursor === "string" || payload.next_cursor === null
      ? payload.next_cursor
      : undefined;
  const page = {
    records: payload.records as Array<NangoRecord<T>>,
  };

  return nextCursor === undefined ? page : { ...page, next_cursor: nextCursor };
}

async function fetchRecordsPage<T>(
  input: FetchNangoRecordsArgs,
  cursor: string | null,
): Promise<NangoRecordsPage<T>> {
  const fetchFn = input.fetchImpl ?? fetch;
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    throwIfAborted(input.signal);

    const bearerToken = `Bearer ${input.nangoSecretKey}`;
    const requestInit: RequestInit = {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: bearerToken,
        "Connection-Id": input.connectionId,
        "Provider-Config-Key": input.providerConfigKey,
      },
      cache: "no-store",
      ...(input.signal ? { signal: input.signal } : {}),
    };
    const response = await fetchFn(buildRecordsUrl(input, cursor), {
      ...requestInit,
    }).catch((error: unknown) => {
      lastError = error;
      return null;
    });

    if (!response) {
      if (isAbortError(lastError)) {
        throw lastError;
      }

      if (input.signal?.aborted) {
        throw getAbortError(input.signal);
      }

      throw new Error(
        `Nango records request failed: ${
          lastError instanceof Error ? lastError.message : "network error"
        }`,
      );
    }

    if (response.status >= 500 && attempt < MAX_ATTEMPTS) {
      const delayMs =
        RETRY_DELAYS_MS[attempt - 1] ??
        RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1] ??
        1_000;
      await sleepWithAbort(delayMs, input);
      continue;
    }

    if (!response.ok) {
      throw await buildRecordsError(response);
    }

    return readRecordsPage<T>(response);
  }

  throw new Error("Nango records request failed after retry attempts.");
}

export async function* fetchNangoRecords<T = Record<string, unknown>>(
  input: FetchNangoRecordsArgs,
): AsyncGenerator<NangoRecord<T>> {
  let cursor: string | null = null;

  do {
    const page: NangoRecordsPage<T> = await fetchRecordsPage<T>(input, cursor);
    for (const record of page.records) {
      throwIfAborted(input.signal);
      yield record;
    }

    cursor = page.next_cursor?.trim() || null;
  } while (cursor);
}
