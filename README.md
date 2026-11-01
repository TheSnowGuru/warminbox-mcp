# Warm Inbox MCP server

[![skills.sh](https://skills.sh/b/TheSnowGuru/warminbox-mcp)](https://skills.sh/TheSnowGuru/warminbox-mcp)

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

## Agent skill

Install the `warm-inbox` agent skill with the [skills CLI](https://github.com/vercel-labs/skills):

```bash
npx skills add TheSnowGuru/warminbox-mcp
```

This installs instructions for safe mailbox connection, deliverability checks, spam-rate triage, and warm-up volume management from [`skills/warm-inbox/SKILL.md`](skills/warm-inbox/SKILL.md). Configure the MCP connection and your API key privately in your client; the skill does not include credentials.

## Use with Lovable / Bolt / Base44

Documentation reviewed 2026-11-01 for these three clients. Obtain your own key at [Warm Inbox API keys](https://warminbox.org/public-api/keys.php). Enter it only in the private connection settings, never in chat, URLs, or committed files.

### Lovable

[Official custom MCP guide](https://docs.lovable.dev/integrations/custom-mcp).

1. Open **Connectors** → **Add custom** (top right of the catalog) → **MCP server**.
2. Set **Server name** to `Warm Inbox`. For **Connection**, keep **Direct connection** (this choice is only shown if your workspace has multiple routes).
3. Set **Server URL** to `https://mcp.warminbox.org/mcp`.
4. For **Authentication**, choose **Bearer token or API key** instead of the default OAuth, and paste your `wi_live_...` key.
5. Click **Add server**.
6. Test with: “Using the Warm Inbox connector, list my warm-ups and show their spam rate.”

Available on all plans. Chat connectors are personal to you and are never part of your published app; they provide builder context only. If **MCP server** is greyed out, a workspace admin disabled custom MCP servers.

### Bolt

[Official MCP guide](https://support.bolt.new/integrations/mcp).

1. From the Bolt homepage chatbox, click the **plus icon** → **Connectors** → **Manage connectors** → **Custom MCP server**.
2. Set **Name** to `Warm Inbox`, **URL** to `https://mcp.warminbox.org/mcp`, and **Transport type** to **HTTP**.
3. Set **Authentication** to **API key** and paste your `wi_live_...` key.
4. Click **Connect** and check for the **Connected** status.
5. Optionally select **Auto-enable for all projects**. Otherwise, enable it per project through the chatbox **plus icon** → **Connectors** → toggle the connector.

Review the tools through **three dots** → **Edit** → **Tools list**; turn off write tools if you only want read access. The server accepts either `Bearer wi_live_...` or the bare `wi_live_...` key in the Authorization header.

### Base44

[Official custom MCP guide](https://docs.base44.com/documentation/account-and-billing/setting-up-a-custom-mcp). Requires a **Builder plan or higher**.

1. Click your **workspace name** (bottom left) → **Account preferences** → **Builder** → scroll to **MCP Connections** → **Add custom MCP**.
2. Set **Name** to `Warm Inbox` and **URL** to `https://mcp.warminbox.org/mcp`.
3. For **Authentication**, choose **Not required**: the key goes in a custom header instead of OAuth.
4. Under **Custom headers**, click **Add header**. Set **Header name** to `Authorization` and **Header value** to `Bearer wi_live_...`. Type the value exactly with the word `Bearer`, a space, then your own key.
5. Click **Test**, then **Test & add**.

Connections are per account and available in all apps and workspaces. MCP provides builder-chat context only and cannot be called from your published app at runtime. Base44 also sends an `X-Base44-App-Id` header, which Warm Inbox ignores.

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
[`skills/warm-inbox/SKILL.md`](skills/warm-inbox/SKILL.md) (installable agent skill), `server.json` (MCP Registry), `.well-known/mcp/server-card.json` (snapshot of the live card), `glama.json` (Glama ownership), `.mcp.json` / `mcp.json` / `.cursor-plugin/plugin.json` (Cursor plugin and cursor.directory).

## License
MIT. See [LICENSE](LICENSE).
