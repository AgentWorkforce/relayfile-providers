import { Nango } from "@nangohq/node";
import type { NangoRecord as SdkNangoRecord } from "@nangohq/node";

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
  /** @deprecated — ignored when using the Nango SDK; kept for backwards compatibility */
  fetchImpl?: typeof fetch;
  /** @deprecated — ignored when using the Nango SDK; kept for backwards compatibility */
  sleepImpl?: (ms: number) => Promise<void>;
  /** Override the Nango client for testing */
  nangoClient?: NangoListRecordsClient;
};

export type FetchNangoRecordsInput = FetchNangoRecordsArgs;

/** Minimal interface for the Nango client's listRecords method, enabling test injection. */
export interface NangoListRecordsClient {
  listRecords<T extends Record<string, unknown> = Record<string, unknown>>(config: {
    providerConfigKey: string;
    connectionId: string;
    model: string;
    modifiedAfter?: string;
    limit?: number;
    cursor?: string | null;
  }): Promise<{ records: Array<SdkNangoRecord<T>>; next_cursor: string | null }>;
}

const DEFAULT_PAGE_SIZE = 100;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    if (signal.reason instanceof Error) {
      throw signal.reason;
    }
    throw new DOMException("The operation was aborted.", "AbortError");
  }
}

function createNangoClient(input: FetchNangoRecordsArgs): NangoListRecordsClient {
  if (input.nangoClient) {
    return input.nangoClient;
  }

  return new Nango({
    secretKey: input.nangoSecretKey,
    host: trimTrailingSlash(input.nangoBaseUrl),
  });
}

export async function* fetchNangoRecords<T = Record<string, unknown>>(
  input: FetchNangoRecordsArgs,
): AsyncGenerator<NangoRecord<T>> {
  const client = createNangoClient(input);
  let cursor: string | null = null;

  do {
    throwIfAborted(input.signal);

    const page: { records: Array<SdkNangoRecord<T & Record<string, unknown>>>; next_cursor: string | null } = await client.listRecords<T & Record<string, unknown>>({
      providerConfigKey: input.providerConfigKey,
      connectionId: input.connectionId,
      model: input.model,
      ...(input.modifiedAfter ? { modifiedAfter: input.modifiedAfter } : {}),
      limit: input.pageSize ?? DEFAULT_PAGE_SIZE,
      ...(cursor ? { cursor } : {}),
    });

    for (const record of page.records) {
      throwIfAborted(input.signal);
      yield record as unknown as NangoRecord<T>;
    }

    cursor = page.next_cursor?.trim() || null;
  } while (cursor);
}
