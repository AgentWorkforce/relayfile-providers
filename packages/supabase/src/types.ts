export interface SupabaseConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  anonKey?: string | undefined;
  webhookSecret?: string | undefined;
  fetch?: typeof fetch | undefined;
}

export interface SupabaseIdentity {
  id: string;
  provider: string;
  user_id?: string;
  identity_id?: string;
  created_at?: string;
  updated_at?: string;
  last_sign_in_at?: string;
  identity_data: Record<string, unknown> & {
    provider_token?: string;
    provider_refresh_token?: string;
  };
  [key: string]: unknown;
}

export interface SupabaseMfaFactor {
  id: string;
  factor_type?: string;
  friendly_name?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface SupabaseUser {
  id: string;
  aud?: string;
  role?: string;
  email?: string;
  phone?: string;
  created_at?: string;
  updated_at?: string;
  last_sign_in_at?: string;
  email_confirmed_at?: string;
  phone_confirmed_at?: string;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
  identities: SupabaseIdentity[];
  factors?: SupabaseMfaFactor[] | undefined;
  [key: string]: unknown;
}

export interface ListUsersOptions {
  page?: number;
  perPage?: number;
  filter?: string;
}

export interface ListUsersResult {
  users: SupabaseUser[];
  total?: number | undefined;
  page: number;
  perPage: number;
}

export interface CreateUserInput {
  email: string;
  password?: string | undefined;
  phone?: string | undefined;
  emailConfirm?: boolean | undefined;
  phoneConfirm?: boolean | undefined;
  metadata?: Record<string, unknown> | undefined;
  userMetadata?: Record<string, unknown> | undefined;
  appMetadata?: Record<string, unknown> | undefined;
  banDuration?: string | undefined;
  role?: string | undefined;
}

export interface UpdateUserInput {
  email?: string | undefined;
  password?: string | undefined;
  phone?: string | undefined;
  emailConfirm?: boolean | undefined;
  phoneConfirm?: boolean | undefined;
  metadata?: Record<string, unknown> | undefined;
  userMetadata?: Record<string, unknown> | undefined;
  appMetadata?: Record<string, unknown> | undefined;
  banDuration?: string | undefined;
  role?: string | undefined;
}

export interface SupabaseSession {
  access_token: string;
  refresh_token?: string | undefined;
  expires_in?: number | undefined;
  expires_at?: number | undefined;
  token_type?: string | undefined;
  user?: SupabaseUser | undefined;
  [key: string]: unknown;
}

export type GenerateLinkType =
  | "invite"
  | "magiclink"
  | "recovery"
  | "signup"
  | "email_change_current"
  | "email_change_new";

export interface GenerateLinkInput {
  redirectTo?: string | undefined;
  data?: Record<string, unknown> | undefined;
}

export interface GenerateLinkResult {
  action_link?: string;
  email_otp?: string;
  hashed_token?: string;
  verification_type?: string;
  [key: string]: unknown;
}

export interface SupabaseJwtClaims {
  sub?: string;
  email?: string;
  role?: string;
  exp?: number;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SupabaseVerifiedSession {
  jwt: string;
  claims: SupabaseJwtClaims;
  user: SupabaseUser;
}

export interface SupabaseSsoProvider {
  id: string;
  type?: string | undefined;
  name?: string | undefined;
  domains?: string[] | undefined;
  metadata_url?: string | undefined;
  created_at?: string | undefined;
  updated_at?: string | undefined;
  [key: string]: unknown;
}

export interface CreateSSOProviderInput {
  type: "oidc" | "saml";
  domains?: string[] | undefined;
  metadataUrl?: string | undefined;
  metadataXml?: string | undefined;
  issuer?: string | undefined;
  clientId?: string | undefined;
  clientSecret?: string | undefined;
  attributeMapping?: Record<string, string> | undefined;
}

export interface SupabaseWebhookPayload {
  type?: string | undefined;
  event?: string | undefined;
  schema?: string | undefined;
  table?: string | undefined;
  record?: Record<string, unknown> | undefined;
  old_record?: Record<string, unknown> | undefined;
  user?: Record<string, unknown> | undefined;
  session?: Record<string, unknown> | undefined;
  claims?: Record<string, unknown> | undefined;
  factor?: Record<string, unknown> | undefined;
  [key: string]: unknown;
}

export interface SupabaseTransportRequest {
  path: string;
  method?: "DELETE" | "GET" | "PATCH" | "POST" | "PUT" | undefined;
  body?: unknown;
  headers?: Record<string, string> | undefined;
  query?: Record<string, number | string | undefined> | undefined;
  signal?: AbortSignal | undefined;
  authMode?: "admin" | "client" | "jwt" | undefined;
  jwt?: string | undefined;
}

export interface SupabaseTransportResponse<T> {
  status: number;
  headers: Record<string, string>;
  data: T;
}

export interface SupabaseTransport {
  readonly config: Readonly<SupabaseConfig>;
  request<T>(input: SupabaseTransportRequest): Promise<SupabaseTransportResponse<T>>;
}
