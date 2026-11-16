# Relayfile Providers

Provider packages connect Relayfile to outside services. They handle sign-in, connection health and authenticated requests so each product does not rebuild that plumbing.

<p align="center">
  <img src="assets/banner.png" alt="Relayfile Providers — auth, proxy, and webhook plumbing for the relayfile filesystem" />
</p>

```
┌──────────────────────────────────────────────────┐
│                  Your App / Agent                 │
├──────────────────────────────────────────────────┤
│                                                  │
│  ┌──────────┐   ┌──────────┐   ┌──────────────┐ │
│  │ Adapter  │──▶│ Provider │──▶│   relayfile   │ │
│  │ (GitHub) │   │ (Nango)  │   │   (VFS)       │ │
│  └──────────┘   └──────────┘   └──────────────┘ │
│                      │                           │
│                      │ OAuth tokens              │
│                      │ API proxy                 │
│                      ▼                           │
│               External APIs                      │
│          (GitHub, Slack, etc.)                    │
└──────────────────────────────────────────────────┘
```


## Get started

See the [repository guide](docs/repository-guide.md) for the supported setup, current limitations and technical reference.

## License

MIT
