/** Tauri HTTP 代理 — 绕过浏览器 CORS */

import { invoke } from '@tauri-apps/api/core';

interface HttpFetchResult {
  status: number;
  body: number[];
  headers: Record<string, string>;
}

interface HttpFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | null;
}

export async function proxyFetch(url: string, init?: RequestInit): Promise<Response> {
  const options: HttpFetchOptions = {
    method: init?.method || 'GET',
    headers: init?.headers as Record<string, string> | undefined,
    body: typeof init?.body === 'string' ? init.body : null,
  };

  const result = await invoke<HttpFetchResult>('http_fetch', { url, options });

  return new Response(new Uint8Array(result.body), {
    status: result.status,
    headers: new Headers(result.headers),
  });
}
