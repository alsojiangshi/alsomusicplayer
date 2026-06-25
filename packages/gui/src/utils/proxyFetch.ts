/** Tauri HTTP 代理 — 绕过浏览器 CORS */

import { invoke, isTauri } from '@tauri-apps/api/core';

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
  if (!isTauri()) {
    return fetch(url, init);
  }

  const options: HttpFetchOptions = {
    method: init?.method || 'GET',
    headers: init?.headers as Record<string, string> | undefined,
    body: typeof init?.body === 'string' ? init.body : null,
  };

  let result: HttpFetchResult;
  try {
    result = await invoke<HttpFetchResult>('http_fetch', { url, options });
  } catch (error: unknown) {
    throw new Error(`Tauri 网络代理请求失败 (${url}): ${formatFetchError(error)}`);
  }

  const response = new Response(new Uint8Array(result.body), {
    status: result.status,
    headers: new Headers(result.headers),
  });

  if (!response.ok) {
    const bodyPreview = new TextDecoder()
      .decode(new Uint8Array(result.body).slice(0, 240))
      .trim();
    throw new Error(
      `远程请求返回 HTTP ${response.status}${bodyPreview ? `: ${bodyPreview}` : ''}`,
    );
  }

  return response;
}

function formatFetchError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return '未知错误';
  }
}
