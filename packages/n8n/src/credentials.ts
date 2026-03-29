import { N8nCredentialTokenError } from "./errors.js";
import {
  asRecord,
  asString,
  getNestedString,
  normalizePaginatedResult,
} from "./internal.js";
import type {
  CreateCredentialInput,
  ListCredentialsOptions,
  N8nCredential,
  N8nCredentialData,
  N8nCredentialSchema,
  N8nCredentialTokenValue,
  N8nRequestExecutor,
  UpdateCredentialInput,
} from "./types.js";

const TOKEN_FIELDS_BY_TYPE: Record<string, readonly string[]> = {
  oAuth2Api: ["access_token", "accessToken", "oauthToken.access_token"],
  githubApi: ["token", "access_token", "accessToken"],
  slackApi: ["token", "access_token", "accessToken"],
  httpBearerAuth: ["token", "value", "access_token"],
  httpHeaderAuth: ["value", "token"],
  httpBasicAuth: ["password"],
};

export async function listCredentials(
  executor: N8nRequestExecutor,
  options: ListCredentialsOptions = {},
): Promise<ReturnType<typeof normalizePaginatedResult<N8nCredential>>> {
  const payload = await executor.request<unknown>({
    method: "GET",
    path: "/credentials",
    query: {
      cursor: options.cursor,
      limit: options.limit,
      type: options.type,
      includeData: options.includeData,
    },
  });

  const normalized = normalizePaginatedResult<Record<string, unknown>>(payload, [
    "data",
    "items",
    "credentials",
  ]);

  return {
    ...normalized,
    data: normalized.data.map(normalizeCredential),
  };
}

export async function getCredential(
  executor: N8nRequestExecutor,
  credentialId: string,
  includeData = true,
): Promise<N8nCredential> {
  const payload = await executor.request<unknown>({
    method: "GET",
    path: `/credentials/${encodeURIComponent(credentialId)}`,
    query: { includeData },
  });

  return normalizeCredential(payload);
}

export async function createCredential(
  executor: N8nRequestExecutor,
  input: CreateCredentialInput,
): Promise<N8nCredential> {
  const payload = await executor.request<unknown>({
    method: "POST",
    path: "/credentials",
    body: input,
  });

  return normalizeCredential(payload);
}

export async function updateCredential(
  executor: N8nRequestExecutor,
  credentialId: string,
  input: UpdateCredentialInput,
): Promise<N8nCredential> {
  const payload = await executor.request<unknown>({
    method: "PATCH",
    path: `/credentials/${encodeURIComponent(credentialId)}`,
    body: input,
  });

  return normalizeCredential(payload);
}

export async function deleteCredential(
  executor: N8nRequestExecutor,
  credentialId: string,
): Promise<void> {
  await executor.request<void>({
    method: "DELETE",
    path: `/credentials/${encodeURIComponent(credentialId)}`,
    responseType: "void",
  });
}

export async function getCredentialSchema(
  executor: N8nRequestExecutor,
  type: string,
): Promise<N8nCredentialSchema> {
  const payload = await executor.requestWithFallback<unknown>([
    {
      method: "GET",
      path: `/credentials/schema/${encodeURIComponent(type)}`,
    },
    {
      method: "GET",
      path: `/credential-types/${encodeURIComponent(type)}`,
    },
    {
      method: "GET",
      path: "/credentials/schema",
      query: { credentialType: type },
    },
  ]);

  return normalizeCredentialSchema(type, payload);
}

export function extractCredentialAccessToken(
  credential: N8nCredential,
  type = credential.type,
): N8nCredentialTokenValue {
  const data = credential.data;
  if (!data) {
    throw new N8nCredentialTokenError(
      `Credential ${credential.id} does not contain decrypted data.`,
      credential.id,
      credential.type,
    );
  }

  const specificFields = TOKEN_FIELDS_BY_TYPE[type] ?? [];
  for (const field of specificFields) {
    const token = getNestedString(data, field);
    if (token) {
      return token;
    }
  }

  return data;
}

export function buildCredentialProxyHeaders(
  credential: N8nCredential,
  tokenValue: N8nCredentialTokenValue,
): Record<string, string> {
  if (typeof tokenValue === "string") {
    if (credential.type === "httpBasicAuth") {
      const username = asString(credential.data?.user) ??
        asString(credential.data?.username);
      if (!username) {
        throw new N8nCredentialTokenError(
          `Credential ${credential.id} is missing a basic auth username.`,
          credential.id,
          credential.type,
        );
      }

      return {
        Authorization: `Basic ${Buffer.from(`${username}:${tokenValue}`).toString("base64")}`,
      };
    }

    if (credential.type === "httpHeaderAuth") {
      const headerName =
        asString(credential.data?.name) ??
        asString(credential.data?.headerName) ??
        "Authorization";

      return {
        [headerName]: headerName.toLowerCase() === "authorization"
          ? `Bearer ${tokenValue}`
          : tokenValue,
      };
    }

    return {
      Authorization: `Bearer ${tokenValue}`,
    };
  }

  const headerName =
    asString(tokenValue.headerName) ??
    asString(tokenValue.name) ??
    asString(tokenValue.header);
  const headerValue =
    asString(tokenValue.value) ??
    asString(tokenValue.token) ??
    asString(tokenValue.apiKey) ??
    asString(tokenValue.api_key);

  if (headerName && headerValue) {
    return { [headerName]: headerValue };
  }

  const bearerToken =
    asString(tokenValue.access_token) ??
    asString(tokenValue.accessToken) ??
    asString(tokenValue.token) ??
    asString(tokenValue.bearerToken);
  if (bearerToken) {
    return { Authorization: `Bearer ${bearerToken}` };
  }

  const username = asString(tokenValue.username) ?? asString(tokenValue.user);
  const password = asString(tokenValue.password);
  if (username && password) {
    return {
      Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
    };
  }

  throw new N8nCredentialTokenError(
    `Credential ${credential.id} does not expose a proxyable token shape.`,
    credential.id,
    credential.type,
  );
}

function normalizeCredential(payload: unknown): N8nCredential {
  const record = asRecord(payload) ?? {};
  const rawData = asRecord(record.data);

  return {
    id: asString(record.id) ?? "",
    name: asString(record.name) ?? "",
    type: asString(record.type) ?? "",
    data: rawData,
    sharedWithProjects: Array.isArray(record.sharedWithProjects)
      ? record.sharedWithProjects.map((entry) => asRecord(entry) ?? {})
      : undefined,
    createdAt: asString(record.createdAt),
    updatedAt: asString(record.updatedAt),
    raw: record,
  };
}

function normalizeCredentialSchema(
  type: string,
  payload: unknown,
): N8nCredentialSchema {
  const record = asRecord(payload) ?? {};
  const properties = Array.isArray(record.properties)
    ? record.properties.map((entry) => {
        const property = asRecord(entry) ?? {};
        return {
          name: asString(property.name) ?? "",
          type: asString(property.type),
          displayName: asString(property.displayName),
          required:
            typeof property.required === "boolean" ? property.required : undefined,
          default: property.default,
          description: asString(property.description),
        };
      })
    : [];

  return {
    type: asString(record.name) ?? type,
    displayName: asString(record.displayName),
    documentationUrl: asString(record.documentationUrl),
    properties,
    raw: record,
  };
}
