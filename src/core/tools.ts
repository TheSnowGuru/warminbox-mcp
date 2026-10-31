import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ApiClient, type ApiOptions } from './api.js';
const id = z.string().min(1).describe('Warm-up id returned by list_warmups.');
const volume = z.number().int().min(0).max(200);
const dashboard = ' Dashboard campaigns (source=dashboard, read_only=true) are read-only; writes return 404 or 403.';
export const serverVersion = '0.1.0';
export function createServer(authorization: string, options: ApiOptions = {}): McpServer {
  const server = new McpServer({ name: 'warminbox-mcp', version: serverVersion });
  const api = new ApiClient(authorization, options);
  const read = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
  const write = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true };
  server.registerTool('get_account', { title: 'Get account', description: 'Confirm the connected Warm Inbox account and subscription before managing warm-ups.', inputSchema: z.object({}).strict(), annotations: { ...read, title: 'Get account' } }, () => api.call('GET', '/me'));
  server.registerTool('list_warmups', { title: 'List warm-ups', description: 'List all warm-ups for the connected account, including API and dashboard campaigns.' + dashboard, inputSchema: z.object({}).strict(), annotations: { ...read, title: 'List warm-ups' } }, () => api.call('GET', '/warmups'));
  server.registerTool('get_warmup', { title: 'Get warm-up', description: 'Read one warm-up and its current configuration.' + dashboard, inputSchema: z.object({ id }).strict(), annotations: { ...read, title: 'Get warm-up' } }, ({ id }) => api.call('GET', `/warmups/${encodeURIComponent(id)}`));
  server.registerTool('get_warmup_health', { title: 'Get warm-up health', description: 'Read live deliverability metrics, including sent volume and 14-day spam rate, for an API or dashboard warm-up.', inputSchema: z.object({ id }).strict(), annotations: { ...read, title: 'Get warm-up health' } }, ({ id }) => api.call('GET', `/warmups/${encodeURIComponent(id)}/health`));
  server.registerTool('create_connect_link', {
    title: 'Create mailbox connect link',
    description: 'Create a one-time hosted connection URL, valid for 30 minutes. Show the returned URL to the user and ask them to open it to enter mailbox credentials themselves. Never request, accept, or handle SMTP/IMAP or Gmail app passwords in AI chat. After the human finishes, use list_warmups and get_warmup_health.',
    inputSchema: z.object({ type: z.enum(['smtp', 'gmail']), email: z.string().email(), first_name: z.string(), last_name: z.string(), emails_per_day: volume, response_rate: z.number().int().min(0).max(100) }).strict(),
    annotations: { ...write, title: 'Create mailbox connect link', idempotentHint: false }
  }, args => api.call('POST', '/connect-links', args));
  for (const action of ['pause', 'resume'] as const) {
    const title = action === 'pause' ? 'Pause warm-up' : 'Resume warm-up';
    server.registerTool(`${action}_warmup`, { title, description: `${action === 'pause' ? 'Pause sending for' : 'Resume sending for'} an API-created warm-up.` + dashboard, inputSchema: z.object({ id }).strict(), annotations: { ...write, title } }, ({ id }) => api.call('POST', `/warmups/${encodeURIComponent(id)}/${action}`));
  }
  server.registerTool('set_emails_per_day', { title: 'Set emails per day', description: 'Set an API-created warm-up daily sending volume (integer 0–200).' + dashboard, inputSchema: z.object({ id, emails_per_day: volume }).strict(), annotations: { ...write, title: 'Set emails per day' } }, ({ id, emails_per_day }) => api.call('PATCH', `/warmups/${encodeURIComponent(id)}`, { emails_per_day }));
  server.registerPrompt('setup_warmup', { title: 'Set up a warm-up', description: 'Guide safe Warm Inbox setup without putting mailbox passwords in AI chat.' }, () => ({ messages: [{ role: 'user', content: { type: 'text', text: 'Confirm the account with get_account. Collect only type, email, first_name, last_name, emails_per_day (0–200), and response_rate (0–100). Call create_connect_link and show its URL to the human. Have them open it and enter credentials there; never ask for passwords. Wait for their confirmation, then call list_warmups and get_warmup_health. Dashboard campaigns are read-only.' } }] }));
  return server;
}
