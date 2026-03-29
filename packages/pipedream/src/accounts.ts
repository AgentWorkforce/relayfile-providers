import { asObject, asOptionalString, normalizeApp } from "./apps.js";
import type {
  JsonObject,
  MaybePromise,
  PipedreamAccount,
  PipedreamUser,
} from "./types.js";

const ACCESS_TOKEN_KEYS = [
  "access_token",
  "accessToken",
  "oauth_access_token",
  "oauthAccessToken",
  "token",
];

const EXTERNAL_USER_KEYS = [
  "external_user_id",
  "externalUserId",
  "end_user_id",
  "endUserId",
  "user_id",
  "userId",
];

export function normalizeAccount(raw: unknown): PipedreamAccount {
  const record = asObject(raw);
  const account: PipedreamAccount = {
    id: typeof record.id === "string" ? record.id : "",
    name: typeof record.name === "string" || record.name === null ? record.name : undefined,
    externalId: asOptionalString(record.external_id),
    externalUserId: extractExternalUserId(record),
    healthy: typeof record.healthy === "boolean" ? record.healthy : undefined,
    dead: typeof record.dead === "boolean" || record.dead === null ? record.dead : undefined,
    app: isRecord(record.app) ? normalizeApp(record.app) : undefined,
    createdAt: asOptionalString(record.created_at),
    updatedAt: asOptionalString(record.updated_at),
    credentials: isRecord(record.credentials) ? record.credentials : null,
    expiresAt: asOptionalString(record.expires_at),
    error: typeof record.error === "string" || record.error === null ? record.error : undefined,
    lastRefreshedAt: asOptionalString(record.last_refreshed_at),
    nextRefreshAt:
      typeof record.next_refresh_at === "string" || record.next_refresh_at === null
        ? record.next_refresh_at
        : undefined,
    raw: record,
  };

  if (!account.id) {
    throw new Error("Expected account.id to be a non-empty string.");
  }

  return account;
}

export function extractAccessToken(account: PipedreamAccount): string | undefined {
  return findStringByKeys(account.credentials, ACCESS_TOKEN_KEYS);
}

export async function resolveExternalUserId(
  account: PipedreamAccount,
  resolver?: (
    account: PipedreamAccount
  ) => MaybePromise<string | undefined>
): Promise<string | undefined> {
  if (account.externalUserId) {
    return account.externalUserId;
  }

  if (resolver) {
    const resolved = await resolver(account);
    if (typeof resolved === "string" && resolved.trim().length > 0) {
      return resolved;
    }
  }

  return undefined;
}

export function deriveUsers(accounts: PipedreamAccount[]): PipedreamUser[] {
  const byUser = new Map<string, PipedreamAccount[]>();

  for (const account of accounts) {
    if (!account.externalUserId) {
      continue;
    }
    const list = byUser.get(account.externalUserId) ?? [];
    list.push(account);
    byUser.set(account.externalUserId, list);
  }

  return [...byUser.entries()].map(([externalUserId, userAccounts]) => ({
    externalUserId,
    accounts: userAccounts,
  }));
}

function extractExternalUserId(record: JsonObject): string | undefined {
  return findStringByKeys(record, EXTERNAL_USER_KEYS);
}

function findStringByKeys(
  value: Record<string, unknown> | null | undefined,
  keys: readonly string[]
): string | undefined {
  if (!value) {
    return undefined;
  }

  const seen = new Set<unknown>();
  const queue: unknown[] = [value];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!isRecord(current) || seen.has(current)) {
      continue;
    }
    seen.add(current);

    for (const key of keys) {
      const candidate = current[key];
      if (typeof candidate === "string" && candidate.trim().length > 0) {
        return candidate;
      }
    }

    for (const child of Object.values(current)) {
      if (isRecord(child)) {
        queue.push(child);
      }
    }
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
