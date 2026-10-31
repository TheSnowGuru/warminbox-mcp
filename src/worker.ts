import { getServerCard, serverCardPath, serverCardHeaders } from './core/server-card.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createServer } from './core/tools.js';
import { validAuthorization, type ApiOptions } from './core/api.js';
import { corsHeaders, rpcError } from './core/http.js';
export interface Env { WARMINBOX_API_BASE?: string }
export async function handleRequest(request: Request, env: Env = {}, options: ApiOptions = {}): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path === serverCardPath && request.method === 'GET') return Response.json(await getServerCard(), { headers: serverCardHeaders });
  if (path === '/healthz' && request.method === 'GET') return Response.json({ ok: true });
  if (path !== '/mcp') return new Response('Not found', { status: 404 });
  const json = (status: number, message: string, extra = {}) => Response.json(rpcError(message), { status, headers: { ...corsHeaders, ...extra } });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  const authorization = request.headers.get('authorization');
  if (!validAuthorization(authorization)) return json(401, 'Missing or malformed Warm Inbox bearer key', { 'WWW-Authenticate': 'Bearer' });
  if (request.method !== 'POST') return json(405, 'Method not allowed in stateless mode', { Allow: 'POST, OPTIONS' });
  const server = createServer(authorization, { ...options, baseUrl: options.baseUrl ?? env.WARMINBOX_API_BASE });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: 1024 * 1024 });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    // Consume JSON before closing so the transport finishes delivering the result.
    const body = await response.arrayBuffer();
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders)) headers.set(key, value);
    return new Response(body.byteLength ? body : null, { status: response.status, headers });
  } catch { return json(500, 'Internal server error'); }
  finally { await server.close(); }
}
export default { fetch: (request: Request, env: Env) => handleRequest(request, env) };
