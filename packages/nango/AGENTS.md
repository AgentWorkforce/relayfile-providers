# Nango Provider Package

This package owns reusable Nango mechanics for Relayfile.

## Put Here

- Nango Connect session creation and reconnect/session helpers.
- Connection list/detail/delete/health helpers.
- Proxy request shaping, token refresh behavior, records/listRecords helpers, and webhook normalization.
- Nango response parsing, fallback endpoint handling, and provider-specific error normalization.

## Keep Out

- Do not import Cloud code, SST `Resource`, Next.js route modules, Drizzle schemas, or workspace database helpers.
- Do not hardcode Agent Relay workspace policy or provider catalog aliases here. Accept concrete Nango config keys and connection ids from callers.
- Do not read `NANGO_SECRET_KEY` directly. Callers pass `secretKey` in `NangoProviderConfig` or `NangoConnectionServiceConfig`.

Cloud may keep a temporary compatibility fallback while a newly published package version rolls out, but new Nango API behavior should be added here first.

## Agency and guidance

- Act autonomously on routine assigned work; ask forgiveness rather than permission. Preserve explicit production, release and credential gates.
- For guidance, ask the engineering leads, the agent that spawned you, or the layered owner on Agent Relay.
- Only a truly pressing or blocking question goes to `khaliq-gant` or `will-washburn` (CODEOWNERS) on Agent Relay.

## Cross-repo context

- Before and during changes, understand how this repo fits the wider system; consult its repo map and related-repo docs where available.
- Check relevant agents’ summaries on Agent Relay and proactively contact owning agents about dependencies, adjacent changes and work in flight.

## Pull requests (when used)

- Open PRs as ready for review by default. If merging requires Khaliq’s OK, use `merge-train:hold` instead of draft status.
- If you open a PR, immediately subscribe to its feedback through Agent Relay using [this skill](https://github.com/AgentWorkforce/skills/blob/main/skills/subscribing-relay-webhooks-and-writebacks/SKILL.md), and verify subscription readiness.
- Evaluate each review finding. Address applicable feedback and explain declined changes in the thread.
- A PR is not ready while feedback remains unaddressed or merge conflicts remain.
- When ready, alert the CODEOWNERS and the agent that spawned you on Agent Relay.
- Keep related open PRs from going stale: find their authoring agent on Agent Relay and coordinate; if that agent is no longer on the relay, escalate to the CODEOWNERS or the layered owner.
