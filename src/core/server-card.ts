import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer, serverVersion } from './tools.js';

export const serverCardPath = '/.well-known/mcp/server-card.json';
export const serverCardHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=3600'
};

async function buildServerCard() {
  // Discovery only: even an accidental tool invocation cannot contact the API.
  const server = createServer('Bearer wi_live_discovery_placeholder', {
    fetch: async () => { throw new Error('Server card cannot call the API'); }
  });
  const client = new Client({ name: 'server-card', version: serverVersion });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const { tools } = await client.listTools();
    const { prompts } = await client.listPrompts();
    return {
      serverInfo: { name: 'Warm Inbox', title: 'Warm Inbox', version: serverVersion },
      authentication: { required: true, schemes: ['bearer'] },
      tools: tools.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, annotations })),
      resources: [],
      prompts: prompts.map(({ name, title, description }) => ({ name, title, description }))
    };
  } finally {
    await client.close();
    await server.close();
  }
}

let cachedCard: ReturnType<typeof buildServerCard> | undefined;
export function getServerCard() {
  return cachedCard ??= buildServerCard().catch(error => {
    cachedCard = undefined;
    throw error;
  });
}
