---
name: warm-inbox
description: Use Warm Inbox to check email warm-up, deliverability, and spam rate, or connect a mailbox for warm-up. Use it to pause, resume, or tune daily warm-up sending volume through Warm Inbox.
---

# Warm Inbox

## Connecting

Use the remote MCP server `https://mcp.warminbox.org/mcp` with Streamable HTTP (stateless).
Authenticate with the header `Authorization: Bearer wi_live_...`.
The human obtains their own key from https://warminbox.org/public-api/keys.php and configures it privately.
Never put the key in chat, URLs, or committed files. All examples below contain placeholders only.

Cursor-style JSON (`.cursor/mcp.json`; use private user settings for real keys):

```json
{"mcpServers":{"warminbox":{"url":"https://mcp.warminbox.org/mcp","headers":{"Authorization":"Bearer <your-own-wi_live_key>"}}}}
```

Claude Code-style JSON (`.mcp.json`; do not commit populated credentials):

```json
{"mcpServers":{"warminbox":{"type":"http","url":"https://mcp.warminbox.org/mcp","headers":{"Authorization":"Bearer <your-own-wi_live_key>"}}}}
```

Or configure Claude Code locally:

```bash
claude mcp add --transport http warminbox https://mcp.warminbox.org/mcp \
  --header 'Authorization: Bearer <your-own-wi_live_key>'
```

Enter the real key privately; shell history and client settings may retain credentials.

## Tools and constraints

Use read tools to investigate. Perform writes only within the human's requested scope.
All tool inputs are strict: supply only the listed fields.
An `id` is a non-empty string returned by `list_warmups`; do not invent IDs.

| Tool | Mode | When to use / inputs |
| --- | --- | --- |
| `get_account` | Read | Confirm the account and subscription before setup or management. No inputs (`{}`). |
| `list_warmups` | Read | Discover all API and dashboard warm-ups and their IDs. No inputs (`{}`). |
| `get_warmup` | Read | Inspect a warm-up's current configuration. Input: `id`. |
| `get_warmup_health` | Read | Check live deliverability, sent volume, and 14-day spam rate for either source. Input: `id`. |
| `create_connect_link` | Write | Start mailbox setup with a one-time hosted URL valid for 30 minutes. Required inputs: `type` (`smtp` or `gmail`), `email` (valid email), `first_name`, `last_name` (strings), `emails_per_day` (integer 0–200), `response_rate` (integer 0–100). |
| `pause_warmup` | Write | Pause sending for an API-created warm-up. Input: `id`. |
| `resume_warmup` | Write | Resume sending for an API-created warm-up. Input: `id`. |
| `set_emails_per_day` | Write | Set daily volume for an API-created warm-up. Inputs: `id`, `emails_per_day` (integer 0–200). |

Dashboard campaigns (`source=dashboard`, `read_only=true`) are readable but cannot be changed through these tools; writes return 404 or 403. Direct the human to the dashboard for those changes.
Pause, resume, and volume changes are reversible and idempotent; creating a connect link is non-idempotent.

**Never ask for, accept, or handle mailbox passwords, SMTP/IMAP passwords, or Gmail app passwords.**
Show the returned connect URL to the human and have them open it to enter credentials on the hosted page themselves.
Wait for their confirmation before checking for the new warm-up. Do not open or complete the credential form for them.

## Workflows

### Set up a new domain's mailbox warm-up

1. Call `get_account` to confirm the account and subscription.
2. Collect only non-secret fields: `type`, `email`, `first_name`, `last_name`, `emails_per_day`, and `response_rate`. Validate the ranges above; a domain alone is insufficient to connect a mailbox.
3. Call `create_connect_link`, show its returned `url`, and explain that it is one-time and expires in 30 minutes (`expires_at`).
4. The human opens the URL and enters mailbox credentials there. Wait for their confirmation.
5. Call `list_warmups` to locate the mailbox and obtain its ID, then `get_warmup_health` to check its initial state. Report unavailable metrics as unavailable.

### Daily deliverability check / spam-rate triage

1. Call `list_warmups`, then `get_warmup_health` for each warm-up.
2. Summarize sent volume and 14-day spam rate; preserve missing or null values rather than treating them as zero.
3. If spam rate is high or worsening, recommend pausing or lowering daily volume. Explain the observed metrics; do not invent a universal safe threshold or guarantee inbox placement.
4. If the human authorizes a change, check the source/read-only flag and use `pause_warmup` or `set_emails_per_day` for an API-created warm-up. Refer dashboard changes to the human.

### Ramp volume gradually

1. Use `list_warmups`, `get_warmup`, and `get_warmup_health` to establish the current daily volume and health of an API-created warm-up.
2. Agree on a gradual ramp within integer 0–200 emails/day and the human's sending goals. Do not jump to the maximum by default.
3. Apply the requested step with `set_emails_per_day`, then verify configuration with `get_warmup`.
4. Recheck health before subsequent increases; recommend holding or lowering volume if spam rate worsens. Do not promise unattended future changes without an actual scheduling mechanism.

### Pause around a cold-outreach campaign change

1. Identify the warm-up with `list_warmups` and inspect it with `get_warmup`.
2. For an API-created warm-up, call `pause_warmup` as requested before the human changes their outreach campaign; verify with `get_warmup`.
3. When the human requests resumption, check health and configuration, call `resume_warmup`, and verify the resulting state.

## Results and errors

- Read object results from `structuredContent` or their serialized text. Lists preserve `{data:[...]}`; connect links preserve `{url,expires_at}`.
- Check `isError` before claiming success. API failures include status/code/message and structured error details; network, timeout, or invalid-JSON failures may have only generic error text.
- `401` means a missing or bad key: ask the human to fix their private client configuration, never to paste the key in chat.
- `404`/`403` on a write may reflect a dashboard campaign; inspect the warm-up source and read-only flag before suggesting another action.
- No automatic retries for writes: a request may have succeeded before a timeout or network failure. Read back state first; a new connect link requires a deliberate new request.
