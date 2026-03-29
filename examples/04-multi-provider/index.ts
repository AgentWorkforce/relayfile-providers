/**
 * Example 04 — Multiple Providers
 *
 * Use different providers for different services in a single app.
 * Each provider handles its own auth; your code just calls proxy().
 */

import type { ConnectionProvider, ProxyRequest } from "@relayfile/sdk";
import { NangoProvider } from "@relayfile/provider-nango";
import { ComposioProvider } from "@relayfile/provider-composio";
import { asConnectionProvider } from "../shared/connection-provider";

// Providers that require RelayFileClient:
// import { RelayFileClient } from "@relayfile/sdk";
// import { ClerkProvider } from "@relayfile/provider-clerk";
// import { PipedreamProvider } from "@relayfile/provider-pipedream";
// import { SupabaseProvider } from "@relayfile/provider-supabase";
// import { N8nProvider } from "@relayfile/provider-n8n";

// ── Config ──────────────────────────────────────────────────────────
const NANGO_SECRET_KEY = process.env.NANGO_SECRET_KEY ?? "nango-mock-key";
const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY ?? "composio-mock-key";

async function main() {
  // ── Standalone providers (no RelayFileClient) ─────────────────────
  const nango = asConnectionProvider(new NangoProvider({ secretKey: NANGO_SECRET_KEY }));
  const composio = asConnectionProvider(new ComposioProvider({ apiKey: COMPOSIO_API_KEY }));

  // ── Providers that need RelayFileClient ───────────────────────────
  // const relayfile = new RelayFileClient({ token: process.env.RELAYFILE_TOKEN! });
  // const clerk     = new ClerkProvider(relayfile, { secretKey: process.env.CLERK_SECRET_KEY! });
  // const pipedream = new PipedreamProvider(relayfile, {
  //   clientId: process.env.PIPEDREAM_CLIENT_ID!,
  //   clientSecret: process.env.PIPEDREAM_CLIENT_SECRET!,
  //   projectId: process.env.PIPEDREAM_PROJECT_ID!,
  // });
  // const supabase = new SupabaseProvider(relayfile, {
  //   supabaseUrl: process.env.SUPABASE_URL!,
  //   serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  // });
  // const n8n = new N8nProvider(relayfile, {
  //   baseUrl: process.env.N8N_BASE_URL!,
  //   apiKey: process.env.N8N_API_KEY!,
  // });

  // ── Registry pattern ──────────────────────────────────────────────
  // Map provider names so you can route requests dynamically.
  const providers: Record<string, ConnectionProvider> = {
    nango,
    composio,
    // clerk,
    // pipedream,
    // supabase,
    // n8n,
  };

  console.log("Registered providers:", Object.keys(providers).join(", "));

  // ── Route a request to the right provider ─────────────────────────
  async function routeProxy(
    providerName: string,
    request: ProxyRequest,
  ) {
    const provider = providers[providerName];
    if (!provider) throw new Error(`Unknown provider: ${providerName}`);
    console.log(`\n[${providerName}] ${request.method} ${request.endpoint}`);
    return provider.proxy(request);
  }

  // ── Example: GitHub via Nango ─────────────────────────────────────
  try {
    const ghResult = await routeProxy("nango", {
      method: "GET",
      endpoint: "/repos/acme/api/pulls",
      connectionId: "conn_github",
    });
    console.log("  Status:", ghResult.status);
  } catch (err) {
    console.log("  (expected failure without credentials)");
  }

  // ── Example: GitHub via Composio ──────────────────────────────────
  try {
    const compResult = await routeProxy("composio", {
      method: "GET",
      endpoint: "/user/repos",
      connectionId: "conn_composio_gh",
    });
    console.log("  Status:", compResult.status);
  } catch (err) {
    console.log("  (expected failure without credentials)");
  }

  // ── Example: Clerk user lookup (commented — needs RelayFileClient)
  // const user = await clerk.getUser("user_abc");
  // console.log("Clerk user:", user.emailAddresses);

  // ── Example: Pipedream workflow (commented)
  // const wfResult = await pipedream.invokeWorkflow("wf_abc", {
  //   body: { event: "deploy" },
  // });

  // ── Example: Supabase user (commented)
  // const sbUser = await supabase.getUser("uid_abc");
  // console.log("Supabase user:", sbUser.email);

  // ── Example: n8n workflow execution (commented)
  // await n8n.executeWorkflow("wf_123", { data: { key: "value" } });

  console.log("\nAll providers initialized successfully.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
