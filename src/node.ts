import { getServerCard, serverCardPath, serverCardHeaders } from './core/server-card.js';
import express from 'express';
import { pathToFileURL } from 'node:url';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './core/tools.js';
import { validAuthorization, type ApiOptions } from './core/api.js';
import { corsHeaders, rpcError } from './core/http.js';
export function createApp(options: ApiOptions = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.get(serverCardPath, async (_req, res) => { res.set(serverCardHeaders).json(await getServerCard()); });
  app.get('/healthz', (_req, res) => { res.json({ ok: true }); });
  app.all('/mcp', async (req, res) => {
    res.set(corsHeaders);
    // Browser preflights carry no credentials and perform no MCP work.
    if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
    const authorization = req.headers.authorization;
    if (!validAuthorization(authorization)) { res.set('WWW-Authenticate', 'Bearer').status(401).json(rpcError('Missing or malformed Warm Inbox bearer key')); return; }
    if (req.method !== 'POST') { res.set('Allow', 'POST, OPTIONS').status(405).json(rpcError('Method not allowed in stateless mode')); return; }
    const server = createServer(authorization, options);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: 1024 * 1024 });
    res.on('close', () => { void server.close(); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch {
      if (!res.headersSent) res.status(500).json(rpcError('Internal server error'));
      await server.close();
    }
  });
  return app;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createApp({ baseUrl: process.env.WARMINBOX_API_BASE }).listen(Number(process.env.PORT ?? 3100), '0.0.0.0', () => console.log('Warm Inbox MCP listening'));
}
