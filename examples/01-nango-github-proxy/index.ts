/**
 * Example 01 — Nango GitHub Proxy
 *
 * Demonstrates NangoProvider proxying GitHub API requests.
 * baseUrl is optional: the provider resolves it from the connection
 * when omitted, or you can override it for non-default API hosts
 * like uploads.github.com.
 */

import type { ConnectionProvider, ProxyRequest } from "@relayfile/sdk";
import { NangoProvider } from "@relayfile/provider-nango";
import { asConnectionProvider } from "../shared/connection-provider";

// ── Config ──────────────────────────────────────────────────────────
// In production, pull from environment variables.
// For local testing you can hardcode or use a .env loader.
const NANGO_SECRET_KEY = process.env.NANGO_SECRET_KEY ?? "nango-mock-secret-key";
const CONNECTION_ID = process.env.NANGO_CONNECTION_ID ?? "conn_github_demo";

async function runProxy(
  provider: ConnectionProvider,
  label: string,
  request: ProxyRequest,
) {
  console.log(`\n--- ${label} ---`);
  const response = await provider.proxy(request);
  console.log("Status:", response.status);
  console.log("Data:", JSON.stringify(response.data, null, 2));
}

async function main() {
  // Nango does not require a RelayFileClient — just the secret key.
  const provider: ConnectionProvider = asConnectionProvider(
    new NangoProvider({
      secretKey: NANGO_SECRET_KEY,
      // baseUrl is optional; defaults to https://api.nango.dev
    }),
  );

  console.log("Provider:", provider.name, "(via ConnectionProvider)");

  // ── 1. Proxy without baseUrl ──────────────────────────────────────
  // The provider resolves the target API host from the connection's
  // provider-config-key (e.g. "github" → api.github.com).
  await runProxy(provider, "List pull requests (baseUrl omitted)", {
    method: "GET",
    endpoint: "/repos/acme/api/pulls",
    connectionId: CONNECTION_ID,
    query: { state: "open", per_page: "5" },
  });

  // ── 2. Proxy WITH baseUrl override ────────────────────────────────
  // uploads.github.com is a different host from the default
  // api.github.com — pass it explicitly.
  await runProxy(provider, "List release assets (baseUrl override)", {
    method: "GET",
    baseUrl: "https://uploads.github.com",
    endpoint: "/repos/acme/api/releases/1/assets",
    connectionId: CONNECTION_ID,
  });

  // ── 3. POST example ──────────────────────────────────────────────
  await runProxy(provider, "Create issue comment", {
    method: "POST",
    endpoint: "/repos/acme/api/issues/42/comments",
    connectionId: CONNECTION_ID,
    body: { body: "Automated comment from relayfile provider" },
  });
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
