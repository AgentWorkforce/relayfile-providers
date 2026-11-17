# Connection authorization health

Reusable, read-only provider checks for hosted Nango and native credential
stores. A saved connection, a credential expiry date and arbitrary HTTP 200
responses are not authorization proof. Checks require the provider's expected
identity or authenticated resource response. Results contain only status,
reason, check time and optional backend presence/authentication mode.

`verifyProviderAuthorization` accepts an authenticated transport.
`credentialTransport` keeps credentials inside the native credential authority.
`verifyNangoAuthorization` fetches the documented connection record, lets Nango
refresh managed credentials, then checks the provider through the documented
`/proxy/{path}` protocol. GitHub App checks use installation repositories and
work for installations with zero repositories. Sync failures do not invalidate
a successful authorization check. Nango's optional status flags are not required.

401 or a documented body-level credential rejection is inactive. 403 remains
unknown (the check may lack scope), as do throttling, transport failures,
unexpected responses and unsupported providers. Provider response bodies and
credentials are never returned in the health result. Redirects are refused.
Transports use manual redirect handling and reject every 3xx response, preserving
credential isolation in both Node.js and Cloudflare Workers.

`AuthorizationProbeQueue` bounds concurrency at eight, pending work at 256,
queue wait at 30 seconds and each running probe at five seconds. Timed out
transports retain their slot until they end. In-flight keys should include the
workspace, backend, connection and credential revision. No result cache means
Refresh always retries, and reauthorization cannot reuse stale proof.

Provider references:

- [Nango connection record](https://nango.dev/docs/reference/backend/http-api/connections/get)
- [Nango proxy](https://nango.dev/docs/reference/backend/http-api/proxy/get)
- [GitHub installation repositories](https://docs.github.com/en/rest/apps/installations#list-repositories-accessible-to-the-app-installation)
- [GitLab current user](https://docs.gitlab.com/api/users/#get-current-user)
- [Gmail profile](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/getProfile)
- [HubSpot account](https://developers.hubspot.com/docs/api-reference/legacy/account/account-information/v1/get-integrations-v1-me)
- [Notion token user](https://developers.notion.com/reference/get-self)
- [Slack authentication test](https://docs.slack.dev/reference/methods/auth.test/)
- [Linear viewer](https://linear.app/developers/graphql)

Verification confirms authorization at the recorded time, not future validity,
all requested scopes, sync completeness or write access.
