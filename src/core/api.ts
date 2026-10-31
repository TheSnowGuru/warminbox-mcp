import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
export const DEFAULT_API_BASE = 'https://warminbox.org/public-api/v1';
export interface ApiOptions { baseUrl?: string; fetch?: typeof globalThis.fetch }
export function validAuthorization(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^Bearer wi_live_[A-Za-z0-9_-]+$/.test(value);
}
// Applied to upstream output as well: an upstream error must never echo a key.
export function redact(value: string, authorization: string): string {
  return value.replaceAll(authorization, '[REDACTED]').replaceAll(authorization.slice(7), '[REDACTED]').replace(/wi_live_[A-Za-z0-9_-]+/g, '[REDACTED]');
}
export class ApiClient {
  constructor(private authorization: string, private options: ApiOptions = {}) {
    if (!validAuthorization(authorization)) throw new Error('Invalid bearer authorization');
  }
  async call(method: string, path: string, body?: unknown): Promise<CallToolResult> {
    try {
      const response = await (this.options.fetch ?? globalThis.fetch)(`${(this.options.baseUrl ?? DEFAULT_API_BASE).replace(/\/+$/, '')}${path}`, {
        method, headers: { Authorization: this.authorization, Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15_000), redirect: 'error'
      });
      const raw: unknown = JSON.parse(redact(await response.text(), this.authorization));
      if (!response.ok) {
        const error = (raw as { error?: { code?: string; message?: string } })?.error;
        return { isError: true, content: [{ type: 'text', text: `Warm Inbox API ${response.status}: ${error?.code ?? 'api_error'}: ${error?.message ?? 'Request failed'}` }], structuredContent: raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : { error: { code: 'api_error', message: 'Request failed' } } };
      }
      return { content: [{ type: 'text', text: JSON.stringify(raw) }], ...(raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? { structuredContent: raw as Record<string, unknown> } : {}) };
    } catch {
      return { isError: true, content: [{ type: 'text', text: 'Warm Inbox API request failed: timeout, network failure, or invalid JSON response. Check connectivity before retrying; a write may already have succeeded.' }] };
    }
  }
}
