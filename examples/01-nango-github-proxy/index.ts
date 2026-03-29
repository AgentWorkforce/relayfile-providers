/**
 * Example 01 — Nango GitHub Proxy
 *
 * Demonstrates NangoProvider proxying GitHub API requests.
 * baseUrl is optional: the provider resolves it from the connection
 * when omitted, or you can override it for non-default API hosts
 * like uploads.github.com.
 */

import type { ConnectionProvider } from "@relayfile/sdk";
import { NangoProvider } from "@relayfile/provider-nango";

// ── Config ──────────────────────────────────────────────────────────
// In production, pull from environment variables.
// For local testing you can hardcode or use a .env loader.
const NANGO_SECRET_KEY = process.env.NANGO_SECRET_KEY ?? "nango-mock-secret-key";
const CONNECTION_ID = process.env.NANGO_CONNECTION_ID ?? "conn_github_demo";

async function main() {
  // Nango does not require a RelayFileClient — just the secret key.
  const nango = new NangoProvider({
    secretKey: NANGO_SECRET_KEY,
    // baseUrl is optional; defaults to https://api.nango.dev
  });

  console.log("Provider:", nango.name);

  // ── 1. Proxy without baseUrl ──────────────────────────────────────
  // The provider resolves the target API host from the connection's
  // provider-config-key (e.g. "github" → api.github.com).
  console.log("\n--- List pull requests (baseUrl omitted) ---");
  const pulls = await nango.proxy({
    method: "GET",
    endpoint: "/repos/acme/api/pulls",
    connectionId: CONNECTION_ID,
    query: { state: "open", per_page: "5" },
  });
  console.log("Status:", pulls.status);
  console.log("Data:", JSON.stringify(pulls.data, null, 2));

  // ── 2. Proxy WITH baseUrl override ────────────────────────────────
  // uploads.github.com is a different host from the default
  // api.github.com — pass it explicitly.
  console.log("\n--- List release assets (baseUrl override) ---");
  const assets = await nango.proxy({
    method: "GET",
    baseUrl: "https://uploads.github.com",
    endpoint: "/repos/acme/api/releases/1/assets",
    connectionId: CONNECTION_ID,
  });
  console.log("Status:", assets.status);
  console.log("Data:", JSON.stringify(assets.data, null, 2));

  // ── 3. POST example ──────────────────────────────────────────────
  console.log("\n--- Create issue comment ---");
  const comment = await nango.proxy({
    method: "POST",
    endpoint: "/repos/acme/api/issues/42/comments",
    connectionId: CONNECTION_ID,
    body: { body: "Automated comment from relayfile provider" },
  });
  console.log("Status:", comment.status);
  console.log("Data:", JSON.stringify(comment.data, null, 2));
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
