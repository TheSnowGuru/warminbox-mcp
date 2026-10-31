import { describe, it, expect, vi, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createServer } from '../src/core/tools.js';
import { createApp } from '../src/node.js';
import { handleRequest } from '../src/worker.js';
import { ApiClient } from '../src/core/api.js';
import type { AddressInfo } from 'node:net';
const auth = 'Bearer wi_live_test_mock_only';
const baseUrl = 'https://mock.invalid/v1';
const disposers: (() => Promise<unknown>)[] = [];
afterEach(async () => { for (const dispose of disposers.splice(0).reverse()) await dispose(); });
async function connected(fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({ data: [] }))) {
  const server = createServer(auth, { baseUrl, fetch });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'test', version: '1' });
  await client.connect(clientTransport);
  disposers.push(() => server.close(), () => client.close());
  return { client, fetch };
}
async function httpServer(fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({ data: [] }))) {
  const server = createApp({ baseUrl, fetch }).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  disposers.push(() => new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, fetch };
}
describe('HTTP authentication and transport', () => {
  it('serves the registered server card without auth or API calls on both entries', async () => {
    const { url, fetch: upstream } = await httpServer();
    const { client } = await connected(upstream);
    const registeredTools = (await client.listTools()).tools;
    const registeredPrompts = (await client.listPrompts()).prompts;
    // Only the loopback HTTP client may use native fetch; discovery must never fetch.
    const nativeFetch = globalThis.fetch;
    const forbiddenFetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network call'));
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const responses = [
          await nativeFetch(`${url}/.well-known/mcp/server-card.json`),
          await handleRequest(new Request('https://mock.invalid/.well-known/mcp/server-card.json'), {}, { fetch: upstream })
        ];
        for (const response of responses) {
          expect(response.status).toBe(200);
          expect(response.headers.get('content-type')).toContain('application/json');
          expect(response.headers.get('access-control-allow-origin')).toBe('*');
          expect(response.headers.get('cache-control')).toBe('public, max-age=3600');
          const card = await response.json();
          expect(card).toEqual({
            serverInfo: { name: 'Warm Inbox', title: 'Warm Inbox', version: '0.1.0' },
            authentication: { required: true, schemes: ['bearer'] },
            tools: registeredTools.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, annotations })),
            resources: [],
            prompts: registeredPrompts.map(({ name, title, description }) => ({ name, title, description }))
          });
          expect(card.tools).toHaveLength(8);
          expect(card.tools.every((tool: { title?: string }) => Boolean(tool.title))).toBe(true);
          expect(card.prompts[0].title).toBe('Set up a warm-up');
          expect(JSON.stringify(card)).not.toMatch(/wi_live_|authorization|password"/i);
        }
      }
      expect(forbiddenFetch).not.toHaveBeenCalled();
      expect(upstream).not.toHaveBeenCalled();
    } finally { forbiddenFetch.mockRestore(); }
  });
  it('rejects absent/malformed auth before processing a body, on Node and Worker', async () => {
    const { url, fetch: upstream } = await httpServer();
    for (const authorization of [undefined, 'Bearer other', 'Bearer wi_live_', 'Basic wi_live_test', 'Bearer wi_live_a extra']) {
      const headers = authorization ? { Authorization: authorization } : {};
      const node = await fetch(`${url}/mcp`, { method: 'POST', headers, body: 'invalid JSON' });
      const worker = await handleRequest(new Request('https://mock.invalid/mcp', { method: 'POST', headers, body: 'invalid JSON' }), {}, { fetch: upstream });
      for (const result of [node, worker]) {
        expect(result.status).toBe(401); expect(result.headers.get('www-authenticate')).toBe('Bearer');
      }
    }
    expect(upstream).not.toHaveBeenCalled();
  });
  it('serves health, preflight, and authenticated stateless 405s on both entries', async () => {
    const { url } = await httpServer();
    for (const method of ['GET', 'DELETE', 'PUT']) {
      const a = await fetch(`${url}/mcp`, { method, headers: { Authorization: auth } });
      const b = await handleRequest(new Request('https://mock.invalid/mcp', { method, headers: { Authorization: auth } }));
      for (const response of [a, b]) { expect(response.status).toBe(405); expect(await response.json()).toMatchObject({ jsonrpc: '2.0', id: null, error: { code: -32000 } }); }
    }
    expect((await fetch(`${url}/healthz`)).status).toBe(200);
    const response = await fetch(`${url}/mcp`, { method: 'OPTIONS' });
    expect(response.status).toBe(204); expect(response.headers.get('access-control-allow-headers')).toContain('Authorization');
  });
  it('SDK HTTP client initializes, lists and calls tools on Node', async () => {
    const { url, fetch: upstream } = await httpServer();
    const client = new Client({ name: 'http-test', version: '1' });
    disposers.push(() => client.close());
    await client.connect(new StreamableHTTPClientTransport(new URL(`${url}/mcp`), { requestInit: { headers: { Authorization: auth } } }));
    expect((await client.listTools()).tools).toHaveLength(8);
    expect(await client.callTool({ name: 'list_warmups', arguments: {} })).toMatchObject({ structuredContent: { data: [] } });
    expect(upstream).toHaveBeenCalledOnce();
  });
  it('SDK client works through Worker fetch handler with per-request credentials', async () => {
    const upstream = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({ data: [] }));
    const adapter: typeof fetch = async (input, init) => handleRequest(new Request(input instanceof Request ? input : String(input), init), {}, { baseUrl, fetch: upstream });
    const client = new Client({ name: 'worker-test', version: '1' });
    disposers.push(() => client.close());
    await client.connect(new StreamableHTTPClientTransport(new URL('https://mock.invalid/mcp'), { fetch: adapter, requestInit: { headers: { Authorization: auth } } }));
    expect((await client.listTools()).tools).toHaveLength(8);
    expect(await client.callTool({ name: 'list_warmups', arguments: {} })).toMatchObject({ structuredContent: { data: [] } });
  });
});
describe('tools', () => {
  it('exposes only eight password-free schemas with annotations', async () => {
    const { client } = await connected();
    const { tools } = await client.listTools();
    expect(tools.map(t => t.name).sort()).toEqual(['get_account','list_warmups','get_warmup','get_warmup_health','create_connect_link','pause_warmup','resume_warmup','set_emails_per_day'].sort());
    for (const tool of tools) {
      expect(JSON.stringify(tool.inputSchema)).not.toMatch(/password/i);
      expect(tool.title).toBeTruthy();
      expect(tool.annotations?.title).toBe(tool.title);
      expect(tool.annotations).toMatchObject({
        readOnlyHint: ['get_account', 'list_warmups', 'get_warmup', 'get_warmup_health'].includes(tool.name),
        destructiveHint: false,
        idempotentHint: tool.name !== 'create_connect_link',
        openWorldHint: true
      });
      expect(tool.annotations).toHaveProperty('readOnlyHint');
      expect(tool.annotations).toHaveProperty('destructiveHint');
      expect(tool.annotations).toHaveProperty('idempotentHint');
    }
  });
  const link = { type: 'smtp', email: 'a@example.com', first_name: 'A', last_name: 'B', emails_per_day: 0, response_rate: 100 };
  it.each([
    ['get_account', {}, 'GET', '/me', undefined],
    ['list_warmups', {}, 'GET', '/warmups', undefined],
    ['get_warmup', { id: 'a/b' }, 'GET', '/warmups/a%2Fb', undefined],
    ['get_warmup_health', { id: 'abc' }, 'GET', '/warmups/abc/health', undefined],
    ['create_connect_link', link, 'POST', '/connect-links', link],
    ['pause_warmup', { id: 'abc' }, 'POST', '/warmups/abc/pause', undefined],
    ['resume_warmup', { id: 'abc' }, 'POST', '/warmups/abc/resume', undefined],
    ['set_emails_per_day', { id: 'abc', emails_per_day: 200 }, 'PATCH', '/warmups/abc', { emails_per_day: 200 }]
  ])('%s forwards exact method, path, body and authorization', async (name, args, method, path, body) => {
    const { client, fetch } = await connected();
    const result = await client.callTool({ name: name as string, arguments: args });
    expect(result).toMatchObject({ structuredContent: { data: [] }, content: [{ type: 'text', text: '{"data":[]}' }] });
    expect(fetch).toHaveBeenCalledWith(baseUrl + path, expect.objectContaining({ method, headers: expect.objectContaining({ Authorization: auth }), body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', signal: expect.any(AbortSignal) }));
  });
  it('maps API JSON errors and redacts echoed keys', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({ error: { code: 'rate_limited', message: `Too many requests ${auth}`, retry_after: 12 } }, { status: 429 }));
    const { client } = await connected(fetch);
    const result = await client.callTool({ name: 'list_warmups', arguments: {} });
    expect(result).toMatchObject({ isError: true });
    expect(JSON.stringify(result)).toContain('rate_limited'); expect(JSON.stringify(result)).not.toContain(auth.slice(7));
  });
  it('rejects passwords and invalid ranges before fetching', async () => {
    const { client, fetch } = await connected();
    for (const args of [{ ...link, smtp_password: 'never-accept' }, { ...link, emails_per_day: 201 }, { ...link, response_rate: -1 }, { ...link, emails_per_day: 1.5 }]) {
      expect(await client.callTool({ name: 'create_connect_link', arguments: args })).toMatchObject({ isError: true });
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it('keeps credentials isolated between requests', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => Response.json({ data: [] }));
    await Promise.all([new ApiClient(auth, { fetch, baseUrl }).call('GET', '/me'), new ApiClient('Bearer wi_live_another_mock', { fetch, baseUrl }).call('GET', '/me')]);
    expect(fetch.mock.calls.map(c => (c[1]?.headers as Record<string, string>).Authorization)).toEqual([auth, 'Bearer wi_live_another_mock']);
  });
  it('maps network and invalid JSON failures without leaking details', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValueOnce(new Error(auth)).mockResolvedValueOnce(new Response('not json'));
    for (let i = 0; i < 2; i++) {
      const result = await new ApiClient(auth, { fetch, baseUrl }).call('GET', '/me');
      expect(result.isError).toBe(true); expect(JSON.stringify(result)).not.toContain(auth);
    }
  });
});
