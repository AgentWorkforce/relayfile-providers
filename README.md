# Relayfile Providers

Auth and credential management for external services. Providers handle OAuth tokens, API proxying, webhook subscriptions, and connection health checks.

## Packages

| Package | npm | Description |
|---------|-----|-------------|
| `@relayfile/provider-nango` | `@relayfile/provider-nango` | Nango — managed OAuth + 250+ integrations |
| `@relayfile/provider-composio` | `@relayfile/provider-composio` | Composio — entity management + action execution |
| `@relayfile/provider-pipedream` | `@relayfile/provider-pipedream` | Pipedream Connect — 2400+ APIs |
| `@relayfile/provider-clerk` | `@relayfile/provider-clerk` | Clerk — end-user OAuth tokens |
| `@relayfile/provider-supabase` | `@relayfile/provider-supabase` | Supabase Auth — social connections |
| `@relayfile/provider-n8n` | `@relayfile/provider-n8n` | n8n — credential store (400+ types) |

## Development

```bash
npm install
npx turbo build
npx turbo test
```

## License

MIT
