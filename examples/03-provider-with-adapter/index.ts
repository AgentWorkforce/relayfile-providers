/** Example 03 — Adapter depends on ConnectionProvider, not a concrete class.
 *  Swap NangoProvider ↔ ComposioProvider without touching adapter code. */

import type { ConnectionProvider } from "@relayfile/sdk";
import { NangoProvider } from "@relayfile/provider-nango";
import { ComposioProvider } from "@relayfile/provider-composio";
import type { NormalizedWebhook, ProxyResponse } from "@relayfile/provider-nango";

// ── Config ──────────────────────────────────────────────────────────
const CONNECTION_ID = process.env.CONNECTION_ID ?? "conn_github_demo";

// ── Adapter accepts any ConnectionProvider ─────────────────────────
class GitHubAdapterStub {
  constructor(private provider: ConnectionProvider) {}

  mapWebhookToPath(webhook: NormalizedWebhook): string {
    return `/${webhook.provider}/${webhook.objectType}/${webhook.objectId}`;
  }

  async writeback(connectionId: string, path: string, payload: Record<string, unknown>): Promise<ProxyResponse> {
    return this.provider.proxy({ method: "POST", endpoint: path, connectionId, body: payload });
  }
}

// ── Swap providers without changing adapter code ────────────────────
function createProvider(name: string): ConnectionProvider {
  if (name === "composio") {
    return new ComposioProvider({ apiKey: process.env.COMPOSIO_API_KEY ?? "mock-key" });
  }
  return new NangoProvider({ secretKey: process.env.NANGO_SECRET_KEY ?? "mock-key" });
}

async function main() {
  const providerName = process.env.PROVIDER ?? "nango";
  const provider = createProvider(providerName);
  const adapter = new GitHubAdapterStub(provider);

  console.log("Provider:", provider.name, "(swap via PROVIDER=composio)");

  // Writeback — same adapter code regardless of provider
  try {
    const res = await adapter.writeback(CONNECTION_ID, "/repos/acme/api/issues/1/comments", { body: "LGTM" });
    console.log("Writeback status:", res.status);
  } catch (err) {
    console.log("Writeback failed (expected without credentials):", (err as Error).message);
  }
}

main().catch((err) => { console.error("Error:", err); process.exit(1); });
