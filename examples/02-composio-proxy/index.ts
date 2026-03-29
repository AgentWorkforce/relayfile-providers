/**
 * Example 02 — Composio Proxy
 *
 * Demonstrates ComposioProvider proxy and toolkit resolution.
 * The provider resolves which action/toolkit to invoke from the
 * connected account when baseUrl is omitted.
 */

import type { ConnectionProvider, ProxyRequest } from "@relayfile/sdk";
import { ComposioProvider } from "@relayfile/provider-composio";
import { asConnectionProvider } from "../shared/connection-provider";

// ── Config ──────────────────────────────────────────────────────────
const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY ?? "composio-mock-api-key";
const ENTITY_ID = process.env.COMPOSIO_ENTITY_ID ?? "entity_demo";
const CONNECTION_ID = process.env.COMPOSIO_CONNECTION_ID ?? "conn_composio_demo";

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
  // Composio does not require a RelayFileClient — just the API key.
  const composio = new ComposioProvider({
    apiKey: COMPOSIO_API_KEY,
    // baseUrl defaults to https://backend.composio.dev/api/v3
  });
  const provider: ConnectionProvider = asConnectionProvider(composio);

  console.log("Provider:", provider.name, "(via ConnectionProvider)");

  // ── 1. Proxy through connected account ────────────────────────────
  // baseUrl is optional — the provider resolves it from the account.
  await runProxy(provider, "Proxy: list GitHub repos via Composio", {
    method: "GET",
    endpoint: "/user/repos",
    connectionId: CONNECTION_ID,
    query: { per_page: "5" },
  });

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
  console.log("Execution successful:", result.successful);
  console.log("Result:", JSON.stringify(result.data, null, 2));

  // ── 4. List connected accounts ────────────────────────────────────
  console.log("\n--- Connected accounts ---");
  const accounts = await composio.listConnectedAccounts();
  console.log("Total:", accounts.total);
  for (const account of accounts.items) {
    console.log(`  - ${account.id} (${account.status})`);
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
