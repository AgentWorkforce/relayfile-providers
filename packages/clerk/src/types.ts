import type {
  ConnectionProvider as SdkConnectionProvider,
  NormalizedWebhook as SdkNormalizedWebhook,
  ProxyRequest as SdkProxyRequest,
  ProxyResponse as SdkProxyResponse,
  WebhookInput,
} from "@relayfile/sdk";

export interface ClerkConfig {
  secretKey: string;
  publishableKey?: string;
  webhookSecret?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

export type ClerkHttpMethod = "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
export type ClerkHeaderValue = string | number | boolean;
export type ClerkQueryValue =
  | ClerkHeaderValue
  | null
  | undefined
  | readonly ClerkHeaderValue[];
export type ClerkQuery = Record<string, ClerkQueryValue>;
export type ClerkHeaders = Record<string, string>;
export type ClerkWebhookHeaders =
  | Headers
  | Record<string, string | readonly string[] | undefined>;

export type ProxyRequest = SdkProxyRequest;

export type ProxyResponse<T = unknown> = SdkProxyResponse<T>;

export type ConnectionProvider = SdkConnectionProvider;

export interface ClerkApiRequest {
  method: ClerkHttpMethod;
  path: string;
  query?: ClerkQuery;
  headers?: ClerkHeaders;
  body?: unknown;
  signal?: AbortSignal;
}

export interface ClerkApiClient {
  request<T>(input: ClerkApiRequest): Promise<T>;
}

export interface ClerkPaginatedResponse<T> {
  data: T[];
  totalCount: number;
  total_count?: number;
}

export interface ClerkDeletedObject {
  id: string;
  deleted?: boolean;
  object?: string;
  slug?: string;
  [key: string]: unknown;
}

export interface ClerkEmailAddress {
  id: string;
  emailAddress?: string | null;
  email_address?: string | null;
  verification?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface ClerkExternalAccount {
  id: string;
  provider?: string;
  providerUserId?: string;
  provider_user_id?: string;
  emailAddress?: string | null;
  email_address?: string | null;
  approvedScopes?: string[];
  approved_scopes?: string[];
  [key: string]: unknown;
}

export interface ClerkUser {
  id: string;
  firstName?: string | null;
  first_name?: string | null;
  lastName?: string | null;
  last_name?: string | null;
  username?: string | null;
  externalId?: string | null;
  external_id?: string | null;
  emailAddresses?: ClerkEmailAddress[];
  email_addresses?: ClerkEmailAddress[];
  externalAccounts?: ClerkExternalAccount[];
  external_accounts?: ClerkExternalAccount[];
  publicMetadata?: Record<string, unknown>;
  public_metadata?: Record<string, unknown>;
  privateMetadata?: Record<string, unknown>;
  private_metadata?: Record<string, unknown>;
  unsafeMetadata?: Record<string, unknown>;
  unsafe_metadata?: Record<string, unknown>;
  createdAt?: number;
  created_at?: number;
  updatedAt?: number;
  updated_at?: number;
  [key: string]: unknown;
}

export interface ClerkOAuthToken {
  object?: string;
  token: string;
  provider: string;
  scopes?: string[];
  userId?: string;
  user_id?: string;
  [key: string]: unknown;
}

export interface ClerkUpdateUserData {
  firstName?: string | null;
  first_name?: string | null;
  lastName?: string | null;
  last_name?: string | null;
  publicMetadata?: Record<string, unknown>;
  public_metadata?: Record<string, unknown>;
  privateMetadata?: Record<string, unknown>;
  private_metadata?: Record<string, unknown>;
  unsafeMetadata?: Record<string, unknown>;
  unsafe_metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ClerkListUsersOptions {
  limit?: number;
  offset?: number;
  email?: string | readonly string[];
  emailAddress?: string | readonly string[];
  query?: string;
  orderBy?: string;
}

export type ClerkSessionStatus =
  | "active"
  | "ended"
  | "expired"
  | "removed"
  | "replaced"
  | "revoked"
  | (string & {});

export interface ClerkSession {
  id: string;
  userId?: string;
  user_id?: string;
  clientId?: string;
  client_id?: string;
  status?: ClerkSessionStatus;
  abandonAt?: number;
  abandon_at?: number;
  expireAt?: number;
  expire_at?: number;
  lastActiveAt?: number;
  last_active_at?: number;
  createdAt?: number;
  created_at?: number;
  updatedAt?: number;
  updated_at?: number;
  [key: string]: unknown;
}

export interface ClerkListSessionsOptions {
  limit?: number;
  offset?: number;
  userId?: string;
  status?: ClerkSessionStatus;
  clientId?: string;
}

export interface ClerkOrganization {
  id: string;
  name?: string;
  slug?: string | null;
  membersCount?: number;
  members_count?: number;
  publicMetadata?: Record<string, unknown>;
  public_metadata?: Record<string, unknown>;
  privateMetadata?: Record<string, unknown>;
  private_metadata?: Record<string, unknown>;
  createdAt?: number;
  created_at?: number;
  updatedAt?: number;
  updated_at?: number;
  [key: string]: unknown;
}

export interface ClerkOrgMember {
  id?: string;
  role?: string;
  publicUserData?: Record<string, unknown>;
  public_user_data?: Record<string, unknown>;
  organization?: ClerkOrganization;
  organizationMembership?: Record<string, unknown>;
  organization_membership?: Record<string, unknown>;
  createdAt?: number;
  created_at?: number;
  updatedAt?: number;
  updated_at?: number;
  [key: string]: unknown;
}

export interface ClerkOrgInvitation {
  id: string;
  emailAddress?: string;
  email_address?: string;
  organizationId?: string;
  organization_id?: string;
  role?: string;
  status?: string;
  createdAt?: number;
  created_at?: number;
  updatedAt?: number;
  updated_at?: number;
  [key: string]: unknown;
}

export interface ClerkListOrganizationsOptions {
  limit?: number;
  offset?: number;
  query?: string;
  includeMembersCount?: boolean;
  orderBy?: string;
}

export interface ClerkListOrgMembersOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
}

export interface ClerkOrgInvitationOptions {
  inviterUserId?: string | null;
  redirectUrl?: string;
  publicMetadata?: Record<string, unknown>;
}

export interface ClerkWebhookEvent {
  type: string;
  data: Record<string, unknown>;
  object?: string;
  [key: string]: unknown;
}

export interface ClerkWebhookEnvelope {
  payload?: string | Uint8Array;
  body?: string | Uint8Array;
  headers: ClerkWebhookHeaders;
}

export interface ClerkJWKS {
  keys: Array<Record<string, unknown>>;
}

export interface ClerkJwtPayload {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
  azp?: string;
  sid?: string;
  [key: string]: unknown;
}

export interface ClerkVerifyTokenOptions {
  audience?: string | string[];
  issuer?: string;
  authorizedParties?: string[];
  clockTolerance?: string | number;
}

export interface ClerkNormalizedWebhook
  extends SdkNormalizedWebhook {
  connectionId: string;
  eventType: string;
  objectType: string;
  objectId: string;
  payload: Record<string, unknown>;
  relations?: string[];
  metadata?: Record<string, string>;
  headers?: Record<string, string>;
  deliveryId?: string;
  timestamp?: string;
}
