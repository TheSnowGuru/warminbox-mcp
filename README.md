# Warm Inbox MCP server

<img src="assets/logo.png" width="64" alt="Warm Inbox logo">

Hosted [Model Context Protocol](https://modelcontextprotocol.io) server for [Warm Inbox](https://warminbox.org), an email warm-up and deliverability service. It lets AI assistants and app builders (Cursor, Claude Code, Lovable, Bolt, Replit, v0, Windsurf, Base44 and others) check warm-up health and spam rates, connect a mailbox through a secure hosted link, and pause, resume or tune daily sending volume.

- **Endpoint:** `https://mcp.warminbox.org/mcp` (Streamable HTTP, stateless)
- **Auth:** `Authorization: Bearer wi_live_...`, your own Warm Inbox API key from https://warminbox.org/public-api/keys.php
- **Server card:** https://mcp.warminbox.org/.well-known/mcp/server-card.json
- **MCP Registry name:** `org.warminbox/mcp`
- **Privacy:** https://warminbox.org/privacy-policy · **Terms:** https://warminbox.org/terms-of-service · **Support:** https://warminbox.org/contact-us

## Safety
- **The AI never handles mailbox passwords.** New warm-ups are only created via `create_connect_link`: the AI shows a one-time URL (valid 30 minutes), and you enter SMTP/IMAP or Gmail credentials on Warm Inbox's hosted page. Tool schemas are strict and reject unknown fields such as passwords.
- The server stores nothing: no keys, sessions, database or request logs. Each request's bearer key is forwarded to the Warm Inbox REST API and discarded. Keys are redacted from upstream output.
- Requests without a valid-looking key get `401` with `WWW-Authenticate: Bearer`.
- Campaigns created in the Warm Inbox dashboard are visible but read-only.

## Tools

| Tool | REST operation | Inputs |
| --- | --- | --- |
| `get_account` | GET /me | none |
| `list_warmups` | GET /warmups | none |
| `get_warmup` | GET /warmups/{id} | id |
| `get_warmup_health` | GET /warmups/{id}/health | id |
| `create_connect_link` | POST /connect-links | type (`smtp`/`gmail`), email, first_name, last_name, emails_per_day (integer 0–200), response_rate (integer 0–100); all required |
| `pause_warmup` | POST /warmups/{id}/pause | id |
| `resume_warmup` | POST /warmups/{id}/resume | id |
| `set_emails_per_day` | PATCH /warmups/{id} | id, emails_per_day (integer 0–200) |

Successful JSON objects are returned unchanged in `structuredContent` and serialized text (apart from key redaction). This preserves `{data:[...]}` on lists, account/plan fields, warm-up source/read_only flags, nullable health metrics, and `{url,expires_at}` connect links. API `{error:{code,message,...}}` failures become `isError:true` with readable status/code/message text and structured error details. Network/timeout/invalid-JSON errors become generic tool errors. Timeout is 15 seconds; no automatic retries, since a write may have succeeded before the connection failed. Dashboard campaigns are read-only and writes return 404 or 403. Pause, resume and volume changes are reversible, non-destructive and idempotent; connect link creation is non-idempotent.

Optional prompt `setup_warmup` guides account confirmation, collecting non-secret fields, displaying the connect URL, waiting for the human, listing warm-ups and checking health.

Every tool has a human-readable `title` and full annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`).

## Client setup

Use endpoint `https://mcp.warminbox.org/mcp` and header `Authorization: Bearer <your-own-wi_live_key>`. Obtain a key at [Warm Inbox API keys](https://warminbox.org/public-api/keys.php). Examples below contain placeholders only. Configure credentials privately in each app, never commit populated configuration or embed real keys in install links.

Documentation reviewed 2026-10-31. UI labels and plan availability can vary; items marked **verify in-app** could not be confirmed from accessible current official documentation.

### Lovable

Add a custom MCP chat connector, name Warm Inbox, enter the endpoint, and choose bearer-token/API-key authentication. Set the token to your `wi_live_...` key; if the UI offers raw headers, use `Authorization: Bearer ...`. Ask “Use Warm Inbox to list my warm-ups.” Custom MCP is builder context; it does not automatically install a runtime backend integration into the generated app. [Official setup and authentication choices](https://docs.lovable.dev/integrations/custom-mcp).

### Bolt.new

Open Connectors, add a custom Connector, set URL to the endpoint and transport to HTTP. Select API-key authentication and supply your key so the outgoing header is `Authorization: Bearer ...` (exact field/prefix behavior: **verify in-app**). [Bolt's official announcement](https://bolt.new/blog/introducing-connectors) confirms remote custom connectors and API-key/OAuth credentials. If this UI cannot emit a bearer header, this server cannot connect through that UI until OAuth is added.

### Replit Agent

In Integrations → MCP Servers → Add MCP server, name Warm Inbox and enter the endpoint. Under Advanced settings add `Authorization` with value `Bearer <your-own-wi_live_key>`, then Test & save. [Official custom-server guide](https://docs.replit.com/build/connect-via-mcp).

[Official Add to Replit link format](https://docs.replit.com/features/mcp/overview): `https://replit.com/integrations?mcp=<URL-encoded-base64-JSON>`. Payload:

```json
{"displayName":"Warm Inbox","baseUrl":"https://mcp.warminbox.org/mcp","headers":[{"key":"Authorization","value":"Bearer <your-own-wi_live_key>"}]}
```

For a public install link omit headers and ask the human to add the key privately after installation. Generate a key-free link locally:

```js
const payload = { displayName: 'Warm Inbox', baseUrl: 'https://mcp.warminbox.org/mcp' };
console.log('https://replit.com/integrations?mcp=' + encodeURIComponent(Buffer.from(JSON.stringify(payload)).toString('base64')));
```

### v0

Open MCP Connections (or the prompt form's MCP entry), add Warm Inbox and the endpoint. Set the Authorization bearer header if custom-header controls are available (**verify in-app**). [Official MCP integrations page](https://v0.app/docs/MCP) confirms both entrypoints; arbitrary bearer-header support was not confirmed. OAuth-only connection screens cannot use this server yet.

### Windsurf

In `~/.codeium/windsurf/mcp_config.json`:

```json
{"mcpServers":{"warminbox":{"serverUrl":"https://mcp.warminbox.org/mcp","headers":{"Authorization":"Bearer <your-own-wi_live_key>"}}}}
```

Reload MCP servers in Cascade. Windsurf is now Devin Desktop; there, add the same `url` + `headers` block to `.devin/config.json` or `~/.config/devin/config.json`.

### Cursor

In `.cursor/mcp.json` (prefer private user configuration for real keys):

```json
{"mcpServers":{"warminbox":{"url":"https://mcp.warminbox.org/mcp","headers":{"Authorization":"Bearer <your-own-wi_live_key>"}}}}
```

Enable the server in MCP settings. [Official configuration](https://docs.cursor.com/context/model-context-protocol). [Official install deeplink](https://prod.cursor.com/docs/mcp/install-links):

```text
cursor://anysphere.cursor-deeplink/mcp/install?name=warminbox&config=<URL-encoded-base64-JSON-config>
```

Use the official generator with the single-server config, or generate a link without credentials:

```js
const config = { url: 'https://mcp.warminbox.org/mcp' };
console.log('cursor://anysphere.cursor-deeplink/mcp/install?name=warminbox&config=' + encodeURIComponent(Buffer.from(JSON.stringify(config)).toString('base64')));
```

After installation, add Authorization privately. Do not distribute bearer keys inside deeplinks.

### Claude Code

```bash
claude mcp add --transport http warminbox https://mcp.warminbox.org/mcp \
  --header 'Authorization: Bearer <your-own-wi_live_key>'
```

Use `/mcp` to inspect the connection. [Official HTTP transport/header documentation](https://code.claude.com/docs/en/mcp). Populate the key privately; shell history and local client settings may retain entered credentials.

### Claude.ai / Claude Desktop custom connectors

Settings → Connectors → Add custom connector → endpoint URL. [Official remote connector guide](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp). **Limitation:** some connector UIs support OAuth or no-auth only and do not expose arbitrary bearer headers. This server rejects no-auth and does not implement OAuth, so those UIs cannot connect directly. Availability of a bearer-header field is **verify in-app**; use Claude Code in the meantime. Do not put the key in the URL.

## Develop / self-host
Node 20+.
```bash
npm ci
npm test               # mocked fetch, never calls production
npm run build
npm run typecheck:worker
npm start              # Node entry on :3100 (PORT, WARMINBOX_API_BASE env)
npx wrangler deploy    # or deploy src/worker.ts to Cloudflare Workers (wrangler.jsonc)
```
`src/core/` holds the shared API client, tools and server card; `src/node.ts` (Express) and `src/worker.ts` (Workers) are thin entrypoints. `ecosystem.config.cjs` is a PM2 example for running the Node entry behind a reverse proxy.

## Listing files
`server.json` (MCP Registry), `.well-known/mcp/server-card.json` (snapshot of the live card), `glama.json` (Glama ownership), `.mcp.json` / `mcp.json` / `.cursor-plugin/plugin.json` (Cursor plugin and cursor.directory).

## License
MIT. See [LICENSE](LICENSE).
