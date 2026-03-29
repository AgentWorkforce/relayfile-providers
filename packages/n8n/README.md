# @relayfile/provider-n8n

Relayfile connection provider for self-hosted n8n instances.

This package wraps the n8n REST API with two layers:

- A Relayfile-compatible provider class that extends `IntegrationProvider`
- A convenience layer for credentials, workflows, executions, node discovery, and webhook ingestion

## Install

```bash
npm install @relayfile/provider-n8n @relayfile/sdk
```

## Configure n8n

This provider targets self-hosted n8n instances. Set `baseUrl` to your own deployment URL, for example `https://n8n.example.com` or `http://localhost:5678`.

### API key auth

1. Log in to your n8n instance.
2. Go to `Settings > n8n API`.
3. Enable the public API if it is not already enabled.
4. Create an API key and store it in an environment variable such as `N8N_API_KEY`.

### Basic auth

If your self-hosted deployment protects n8n with HTTP basic auth, pass `username` and `password` to the provider instead of an API key. A common local setup looks like:

```bash
export N8N_BASE_URL="http://localhost:5678"
export N8N_BASIC_AUTH_ACTIVE="true"
export N8N_BASIC_AUTH_USER="relay"
export N8N_BASIC_AUTH_PASSWORD="file"
```

## Usage

```ts
import { RelayFileClient } from "@relayfile/sdk";
import { createN8nProvider } from "@relayfile/provider-n8n";

const relayfile = new RelayFileClient({
  baseUrl: process.env.RELAYFILE_BASE_URL!,
  token: process.env.RELAYFILE_TOKEN!,
});

const provider = createN8nProvider(relayfile, {
  baseUrl: process.env.N8N_BASE_URL!,
  apiKey: process.env.N8N_API_KEY,
});

const credentials = await provider.listCredentials({ type: "githubApi" });
const workflow = await provider.activateWorkflow("workflow-123");
const proxyResponse = await provider.proxy({
  method: "GET",
  baseUrl: "https://api.github.com",
  endpoint: "/user",
  connectionId: "credential-123",
});
```

Basic-auth configuration:

```ts
const provider = createN8nProvider(relayfile, {
  baseUrl: process.env.N8N_BASE_URL!,
  username: process.env.N8N_BASIC_AUTH_USER!,
  password: process.env.N8N_BASIC_AUTH_PASSWORD!,
});
```

## Webhooks

n8n Webhook nodes expose both production and test URLs:

- Production: `{N8N_URL}/webhook/{path}`
- Test: `{N8N_URL}/webhook-test/{path}`

`N8nProvider.ingestWebhook()` normalizes the incoming webhook payload and forwards it to Relayfile using a canonical path derived from the normalized event.

## Scripts

```bash
npm run build
npm test
```
