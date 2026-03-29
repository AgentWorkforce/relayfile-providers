import type {
  CreateSSOProviderInput,
  CreateUserInput,
  ListUsersOptions,
  ListUsersResult,
  SupabaseIdentity,
  SupabaseMfaFactor,
  SupabaseSsoProvider,
  SupabaseTransport,
  SupabaseUser,
  UpdateUserInput,
} from "./types.js";

export async function listUsers(
  transport: SupabaseTransport,
  options: ListUsersOptions = {},
): Promise<ListUsersResult> {
  const page = options.page ?? 1;
  const perPage = options.perPage ?? 50;
  const response = await transport.request<unknown>({
    path: "/admin/users",
    query: {
      page,
      per_page: perPage,
      filter: options.filter,
    },
  });
  const data = response.data;
  const users = Array.isArray(data)
    ? data.map(normalizeUser)
    : Array.isArray(getRecord(data).users)
      ? getRecord(data).users.map(normalizeUser)
      : [];
  const total = parseTotalCount(response.headers, getRecord(data).total);

  return {
    users,
    page,
    perPage,
    ...(total !== undefined ? { total } : {}),
  };
}

export async function getUser(
  transport: SupabaseTransport,
  userId: string,
  signal?: AbortSignal,
): Promise<SupabaseUser> {
  const response = await transport.request<unknown>({
    path: `/admin/users/${encodeURIComponent(userId)}`,
    signal,
  });
  const data = getRecord(response.data);
  return normalizeUser(data.user ?? data);
}

export async function createUser(
  transport: SupabaseTransport,
  input: CreateUserInput,
  signal?: AbortSignal,
): Promise<SupabaseUser> {
  const response = await transport.request<unknown>({
    path: "/admin/users",
    method: "POST",
    body: normalizeUserWriteInput(input),
    signal,
  });
  return normalizeUser(getRecord(response.data));
}

export async function updateUser(
  transport: SupabaseTransport,
  userId: string,
  input: UpdateUserInput,
  signal?: AbortSignal,
): Promise<SupabaseUser> {
  const response = await transport.request<unknown>({
    path: `/admin/users/${encodeURIComponent(userId)}`,
    method: "PUT",
    body: normalizeUserWriteInput(input),
    signal,
  });
  return normalizeUser(getRecord(response.data));
}

export async function deleteUser(
  transport: SupabaseTransport,
  userId: string,
  signal?: AbortSignal,
): Promise<void> {
  await transport.request({
    path: `/admin/users/${encodeURIComponent(userId)}`,
    method: "DELETE",
    signal,
  });
}

export async function getUserIdentities(
  transport: SupabaseTransport,
  userId: string,
  signal?: AbortSignal,
): Promise<SupabaseIdentity[]> {
  const user = await getUser(transport, userId, signal);
  return user.identities;
}

export async function unlinkIdentity(
  transport: SupabaseTransport,
  userId: string,
  identityId: string,
  signal?: AbortSignal,
): Promise<void> {
  await transport.request({
    path: `/admin/users/${encodeURIComponent(userId)}/identities/${encodeURIComponent(identityId)}`,
    method: "DELETE",
    signal,
  });
}

export async function listFactors(
  transport: SupabaseTransport,
  userId: string,
  signal?: AbortSignal,
): Promise<SupabaseMfaFactor[]> {
  const user = await getUser(transport, userId, signal);
  return Array.isArray(user.factors) ? user.factors.map(normalizeFactor) : [];
}

export async function listSSO(
  transport: SupabaseTransport,
  options: ListUsersOptions = {},
): Promise<SupabaseSsoProvider[]> {
  const response = await transport.request<unknown>({
    path: "/admin/sso/providers",
    query: {
      page: options.page,
      per_page: options.perPage,
      filter: options.filter,
    },
  });
  const data = getRecord(response.data);
  const items = Array.isArray(data.items)
    ? data.items
    : Array.isArray(data.providers)
      ? data.providers
      : Array.isArray(response.data)
        ? response.data
        : [];
  return items.map(normalizeSsoProvider);
}

export async function createSSOProvider(
  transport: SupabaseTransport,
  input: CreateSSOProviderInput,
  signal?: AbortSignal,
): Promise<SupabaseSsoProvider> {
  const response = await transport.request<unknown>({
    path: "/admin/sso/providers",
    method: "POST",
    body: compactObject({
      type: input.type,
      domains: input.domains,
      metadata_url: input.metadataUrl,
      metadata_xml: input.metadataXml,
      issuer: input.issuer,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      attribute_mapping: input.attributeMapping,
    }),
    signal,
  });
  return normalizeSsoProvider(getRecord(response.data));
}

function normalizeUser(input: unknown): SupabaseUser {
  const record = getRecord(input);
  const appMetadata = getRecord(record.app_metadata);
  const userMetadata = getRecord(record.user_metadata);
  const identities = Array.isArray(record.identities)
    ? record.identities.map(normalizeIdentity)
    : [];
  const factors = Array.isArray(record.factors)
    ? record.factors.map(normalizeFactor)
    : undefined;

  return {
    ...record,
    id: readString(record.id, "Supabase user is missing id."),
    app_metadata: appMetadata,
    user_metadata: userMetadata,
    identities,
    ...(factors ? { factors } : {}),
  };
}

function normalizeIdentity(input: unknown): SupabaseIdentity {
  const record = getRecord(input);
  return {
    ...record,
    id: readString(record.id ?? record.identity_id, "Supabase identity is missing id."),
    provider: readString(record.provider, "Supabase identity is missing provider."),
    identity_data: getRecord(record.identity_data),
  };
}

function normalizeFactor(input: unknown): SupabaseMfaFactor {
  const record = getRecord(input);
  return {
    ...record,
    id: readString(record.id, "Supabase factor is missing id."),
  };
}

function normalizeSsoProvider(input: unknown): SupabaseSsoProvider {
  const record = getRecord(input);
  return {
    ...record,
    id: readString(record.id, "Supabase SSO provider is missing id."),
  };
}

function normalizeUserWriteInput(input: CreateUserInput | UpdateUserInput): Record<string, unknown> {
  const userMetadata = input.userMetadata ?? input.metadata;
  return compactObject({
    ...(input.email !== undefined ? { email: input.email } : {}),
    ...(input.password !== undefined ? { password: input.password } : {}),
    ...(input.phone !== undefined ? { phone: input.phone } : {}),
    ...(input.emailConfirm !== undefined ? { email_confirm: input.emailConfirm } : {}),
    ...(input.phoneConfirm !== undefined ? { phone_confirm: input.phoneConfirm } : {}),
    ...(userMetadata !== undefined ? { user_metadata: userMetadata } : {}),
    ...(input.appMetadata !== undefined ? { app_metadata: input.appMetadata } : {}),
    ...(input.banDuration !== undefined ? { ban_duration: input.banDuration } : {}),
    ...(input.role !== undefined ? { role: input.role } : {}),
  });
}

function parseTotalCount(
  headers: Record<string, string>,
  fallback: unknown,
): number | undefined {
  const direct = headers["x-total-count"];
  if (direct) {
    const parsed = Number.parseInt(direct, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  const contentRange = headers["content-range"];
  if (contentRange) {
    const tail = contentRange.split("/").at(-1);
    const parsed = tail ? Number.parseInt(tail, 10) : Number.NaN;
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  if (typeof fallback === "number" && Number.isFinite(fallback)) {
    return fallback;
  }

  return undefined;
}

function getRecord(input: unknown): Record<string, any> {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return input as Record<string, any>;
  }
  return {};
}

function readString(value: unknown, message: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(message);
  }
  return value;
}

function compactObject<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as T;
}
