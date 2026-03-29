/**
 * Example 02 — Composio Proxy
 *
 * Demonstrates ComposioProvider proxy and toolkit resolution.
 * The provider resolves which action/toolkit to invoke from the
 * connected account when baseUrl is omitted.
 */

import { ComposioProvider } from "@relayfile/provider-composio";

// ── Config ──────────────────────────────────────────────────────────
const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY ?? "composio-mock-api-key";
const ENTITY_ID = process.env.COMPOSIO_ENTITY_ID ?? "entity_demo";
const CONNECTION_ID = process.env.COMPOSIO_CONNECTION_ID ?? "conn_composio_demo";

async function main() {
  // Composio does not require a RelayFileClient — just the API key.
  const composio = new ComposioProvider({
    apiKey: COMPOSIO_API_KEY,
    // baseUrl defaults to https://backend.composio.dev/api/v3
  });

  console.log("Provider:", composio.name);

  // ── 1. Proxy through connected account ────────────────────────────
  // baseUrl is optional — the provider resolves it from the account.
  console.log("\n--- Proxy: list GitHub repos via Composio ---");
  const repos = await composio.proxy({
    method: "GET",
    endpoint: "/user/repos",
    connectionId: CONNECTION_ID,
    query: { per_page: "5" },
  });
  console.log("Status:", repos.status);
  console.log("Data:", JSON.stringify(repos.data, null, 2));

  // ── 2. Toolkit / action resolution ────────────────────────────────
  // lookupAction resolves which Composio action maps to a proxy request.
  console.log("\n--- Action lookup ---");
  const lookup = await composio.lookupAction({
    method: "POST",
    endpoint: "/repos/acme/api/issues",
    connectionId: CONNECTION_ID,
    body: { title: "Bug report", body: "Details here" },
  });
  console.log("Matched by:", lookup.matchedBy);
  console.log("Toolkit:", lookup.toolkitSlug ?? "(none)");
  console.log("Action:", lookup.toolSlug ?? "(none)");

  // ── 3. Execute an action directly ─────────────────────────────────
  console.log("\n--- Execute action: GITHUB_CREATE_ISSUE ---");
  const result = await composio.executeAction(
    "GITHUB_CREATE_ISSUE",
    ENTITY_ID,
    { owner: "acme", repo: "api", title: "Filed by relayfile" },
  );
  console.log("Execution status:", result.status);
  console.log("Result:", JSON.stringify(result.data, null, 2));

  // ── 4. List connected accounts ────────────────────────────────────
  console.log("\n--- Connected accounts ---");
  const accounts = await composio.listConnectedAccounts();
  console.log("Total:", accounts.totalCount);
  for (const account of accounts.items) {
    console.log(`  - ${account.id} (${account.status})`);
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
