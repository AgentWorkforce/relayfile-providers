/**
 * Example 05 — Health Checks & Connection Listing
 *
 * Demonstrates healthCheck() and listConnections() across providers.
 * Useful for dashboards, monitoring, and debugging auth issues.
 */

import {
  NangoProvider,
  getConnectionHealth,
  healthCheckNangoConnection,
} from "@relayfile/provider-nango";
import { ComposioProvider } from "@relayfile/provider-composio";

// ── Config ──────────────────────────────────────────────────────────
const NANGO_SECRET_KEY = process.env.NANGO_SECRET_KEY ?? "nango-mock-key";
const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY ?? "composio-mock-key";
const CONNECTION_ID = process.env.CONNECTION_ID ?? "conn_demo";

async function main() {
  const nango = new NangoProvider({ secretKey: NANGO_SECRET_KEY });
  const composio = new ComposioProvider({ apiKey: COMPOSIO_API_KEY });

  // ── 1. Simple boolean health check ────────────────────────────────
  console.log("--- Simple health checks ---");
  try {
    const nangoHealthy = await nango.healthCheck(CONNECTION_ID);
    console.log(`Nango connection "${CONNECTION_ID}":`, nangoHealthy ? "healthy" : "unhealthy");
  } catch (err) {
    console.log(`Nango health check failed (expected without credentials):`, (err as Error).message);
  }

  try {
    const composioHealthy = await composio.healthCheck(CONNECTION_ID);
    console.log(`Composio connection "${CONNECTION_ID}":`, composioHealthy ? "healthy" : "unhealthy");
  } catch (err) {
    console.log(`Composio health check failed (expected without credentials):`, (err as Error).message);
  }

  // ── 2. Detailed Nango health diagnostic ───────────────────────────
  console.log("\n--- Detailed Nango connection health ---");
  try {
    const detail = await nango.getConnectionHealth(CONNECTION_ID);
    console.log("Status:", detail.status);
    console.log("Reasons:", detail.reasons);
    console.log("Details:", JSON.stringify(detail.details, null, 2));
  } catch (err) {
    console.log("Detailed health check failed (expected):", (err as Error).message);
  }

  // ── 3. Standalone health check functions ──────────────────────────
  // You can also use the exported functions directly without a provider
  // instance, which is useful in serverless or edge contexts.
  console.log("\n--- Standalone health check functions ---");
  try {
    const quick = await healthCheckNangoConnection(CONNECTION_ID, {
      secretKey: NANGO_SECRET_KEY,
    });
    console.log("Quick check:", quick);
  } catch (err) {
    console.log("Standalone check failed (expected):", (err as Error).message);
  }

  // ── 4. List Nango connections ─────────────────────────────────────
  console.log("\n--- List Nango connections ---");
  try {
    const connections = await nango.listConnections();
    console.log(`Found ${connections.length} connection(s)`);
    for (const conn of connections) {
      console.log(`  - ${conn.connectionId} (provider: ${conn.providerConfigKey})`);
    }
  } catch (err) {
    console.log("List connections failed (expected):", (err as Error).message);
  }

  // ── 5. List Nango connections filtered by provider ────────────────
  console.log("\n--- List Nango connections (filtered by provider) ---");
  try {
    const ghConnections = await nango.listConnections("github");
    console.log(`Found ${ghConnections.length} GitHub connection(s)`);
  } catch (err) {
    console.log("Filtered list failed (expected):", (err as Error).message);
  }

  // ── 6. Get single connection detail ───────────────────────────────
  console.log("\n--- Get connection detail ---");
  try {
    const detail = await nango.getConnectionDetail(CONNECTION_ID);
    console.log("Connection:", detail.connection?.connectionId);
    console.log("Provider:", detail.connection?.providerConfigKey);
  } catch (err) {
    console.log("Get detail failed (expected):", (err as Error).message);
  }

  // ── 7. Composio connected accounts ────────────────────────────────
  console.log("\n--- Composio connected accounts ---");
  try {
    const accounts = await composio.listConnectedAccounts();
    console.log(`Found ${accounts.totalCount} account(s)`);
    for (const acct of accounts.items) {
      console.log(`  - ${acct.id}`);
    }
  } catch (err) {
    console.log("Composio accounts failed (expected):", (err as Error).message);
  }

  console.log("\nDone. All health/connection examples complete.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
