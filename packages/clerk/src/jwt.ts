import { createLocalJWKSet, jwtVerify } from "jose";
import type { JSONWebKeySet } from "jose";

import type {
  ClerkApiClient,
  ClerkJWKS,
  ClerkJwtPayload,
  ClerkVerifyTokenOptions,
} from "./types.js";

export async function getJWKS(client: ClerkApiClient): Promise<ClerkJWKS> {
  return client.request<ClerkJWKS>({
    method: "GET",
    path: "/v1/jwks",
  });
}

export async function verifyClerkToken(
  client: ClerkApiClient,
  token: string,
  options: ClerkVerifyTokenOptions = {},
): Promise<ClerkJwtPayload> {
  const jwks = await getJWKS(client);
  const keySet = createLocalJWKSet(jwks as JSONWebKeySet);
  const verifyOptions: {
    audience?: string | string[];
    issuer?: string;
    clockTolerance?: string | number;
  } = {};

  if (options.audience !== undefined) {
    verifyOptions.audience = options.audience;
  }
  if (options.issuer !== undefined) {
    verifyOptions.issuer = options.issuer;
  }
  if (options.clockTolerance !== undefined) {
    verifyOptions.clockTolerance = options.clockTolerance;
  }

  const { payload } = await jwtVerify(token, keySet, verifyOptions);

  if (
    options.authorizedParties &&
    options.authorizedParties.length > 0 &&
    typeof payload.azp === "string" &&
    !options.authorizedParties.includes(payload.azp)
  ) {
    throw new Error(`JWT azp "${payload.azp}" is not in the allowed authorized parties list.`);
  }

  return payload as ClerkJwtPayload;
}
