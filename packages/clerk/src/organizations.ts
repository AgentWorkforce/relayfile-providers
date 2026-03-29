import type {
  ClerkApiClient,
  ClerkListOrgMembersOptions,
  ClerkListOrganizationsOptions,
  ClerkOrgInvitation,
  ClerkOrgInvitationOptions,
  ClerkOrgMember,
  ClerkOrganization,
  ClerkPaginatedResponse,
} from "./types.js";
import { normalizePaginatedResponse } from "./pagination.js";

export async function listOrganizations(
  client: ClerkApiClient,
  options: ClerkListOrganizationsOptions = {},
): Promise<ClerkPaginatedResponse<ClerkOrganization>> {
  const response = await client.request<unknown>({
    method: "GET",
    path: "/v1/organizations",
    query: {
      limit: options.limit,
      offset: options.offset,
      query: options.query,
      includeMembersCount: options.includeMembersCount,
      orderBy: options.orderBy,
    },
  });

  return normalizePaginatedResponse<ClerkOrganization>(response);
}

export async function getOrganization(
  client: ClerkApiClient,
  organizationId: string,
): Promise<ClerkOrganization> {
  return client.request<ClerkOrganization>({
    method: "GET",
    path: `/v1/organizations/${encodeURIComponent(organizationId)}`,
  });
}

export async function listOrgMembers(
  client: ClerkApiClient,
  organizationId: string,
  options: ClerkListOrgMembersOptions = {},
): Promise<ClerkPaginatedResponse<ClerkOrgMember>> {
  const response = await client.request<unknown>({
    method: "GET",
    path: `/v1/organizations/${encodeURIComponent(organizationId)}/memberships`,
    query: {
      limit: options.limit,
      offset: options.offset,
      orderBy: options.orderBy,
    },
  });

  return normalizePaginatedResponse<ClerkOrgMember>(response);
}

export async function createOrgInvitation(
  client: ClerkApiClient,
  organizationId: string,
  emailAddress: string,
  role: string,
  options: ClerkOrgInvitationOptions = {},
): Promise<ClerkOrgInvitation> {
  return client.request<ClerkOrgInvitation>({
    method: "POST",
    path: `/v1/organizations/${encodeURIComponent(organizationId)}/invitations`,
    body: {
      emailAddress,
      role,
      inviterUserId: options.inviterUserId ?? null,
      redirectUrl: options.redirectUrl,
      publicMetadata: options.publicMetadata,
    },
  });
}
