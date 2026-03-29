/**
 * Example 03 — Provider + Adapter (MOST IMPORTANT)
 *
 * Shows the core relayfile pattern: a Provider handles auth while an
 * Adapter normalizes data and writes back through the provider.
 *
 * Flow:
 *   Webhook → NangoProvider.handleWebhook() normalizes the event
 *   → GitHubAdapter maps it to a VFS path
 *   → Adapter writes back through NangoProvider.proxy()
 *
 * This example simulates the full cycle with mock webhook data.
 */

import { NangoProvider } from "@relayfile/provider-nango";
import type { NormalizedWebhook, ProxyResponse } from "@relayfile/provider-nango";

// ── Config ──────────────────────────────────────────────────────────
const NANGO_SECRET_KEY = process.env.NANGO_SECRET_KEY ?? "nango-mock-secret-key";
const CONNECTION_ID = process.env.NANGO_CONNECTION_ID ?? "conn_github_demo";

// ── Mock adapter ────────────────────────────────────────────────────
// In production you would import GitHubAdapter from @relayfile/adapter-github.
// This minimal adapter demonstrates the contract between adapter and provider.

interface AdapterWritebackRequest {
  connectionId: string;
  path: string;
  payload: Record<string, unknown>;
}

class GitHubAdapterStub {
  constructor(private provider: NangoProvider) {}

  /**
   * Convert a normalized webhook into a VFS path.
   * Real adapters do richer mapping; this shows the shape.
   */
  mapWebhookToPath(webhook: NormalizedWebhook): string {
    const { provider, objectType, objectId, eventType } = webhook;
    // Example: /github/repos/acme/api/issues/42
    return `/${provider}/${objectType}/${objectId}`;
  }

  /**
   * Write back to the external API through the provider.
   * The provider handles OAuth — the adapter just describes the request.
   */
  async writeback(request: AdapterWritebackRequest): Promise<ProxyResponse> {
    console.log(`[Adapter] Writing back to ${request.path}`);
    return this.provider.proxy({
      method: "POST",
      endpoint: request.path,
      connectionId: request.connectionId,
      body: request.payload,
      // baseUrl omitted — provider resolves from connection
    });
  }
}

// ── Mock webhook payload ────────────────────────────────────────────
// Simulates a Nango forward-webhook for a GitHub pull_request event.
const mockWebhookPayload = {
  type: "forward",
  connectionId: CONNECTION_ID,
  providerConfigKey: "github",
  payload: {
    action: "opened",
    pull_request: {
      number: 99,
      title: "Add relayfile examples",
      html_url: "https://github.com/acme/api/pull/99",
      user: { login: "agent-bot" },
    },
    repository: {
      full_name: "acme/api",
    },
  },
};

async function main() {
  const nango = new NangoProvider({
    secretKey: NANGO_SECRET_KEY,
  });
  const adapter = new GitHubAdapterStub(nango);

  console.log("Provider:", nango.name);

  // ── Step 1: Normalize the incoming webhook ────────────────────────
  console.log("\n--- Step 1: Normalize webhook ---");
  const webhook = await nango.handleWebhook(mockWebhookPayload);
  console.log("Provider:", webhook.provider);
  console.log("Event:", webhook.eventType);
  console.log("Object:", webhook.objectType, webhook.objectId);
  console.log("Connection:", webhook.connectionId);

  // ── Step 2: Adapter maps webhook to VFS path ─────────────────────
  console.log("\n--- Step 2: Map to VFS path ---");
  const vfsPath = adapter.mapWebhookToPath(webhook);
  console.log("VFS path:", vfsPath);

  // ── Step 3: Adapter writes back through provider ──────────────────
  console.log("\n--- Step 3: Writeback through provider ---");
  try {
    const response = await adapter.writeback({
      connectionId: CONNECTION_ID,
      path: "/repos/acme/api/pulls/99/comments",
      payload: { body: "Thanks for the PR! Reviewing now." },
    });
    console.log("Writeback status:", response.status);
    console.log("Writeback data:", JSON.stringify(response.data, null, 2));
  } catch (err) {
    // Expected when running without real credentials
    console.log("Writeback failed (expected without real credentials):", (err as Error).message);
  }

  // ── Step 4: Show the full flow ────────────────────────────────────
  console.log("\n--- Full flow summary ---");
  console.log("1. Webhook received from Nango (GitHub push event)");
  console.log("2. Provider normalized it into a NormalizedWebhook");
  console.log("3. Adapter mapped it to VFS path:", vfsPath);
  console.log("4. Adapter wrote back through provider.proxy()");
  console.log("5. Provider injected OAuth token and forwarded to GitHub API");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
