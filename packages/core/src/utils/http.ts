/** 可替换的 HTTP 客户端 — 浏览器注入 Tauri HTTP 代理绕过 CORS */

let _fetch: typeof globalThis.fetch = globalThis.fetch.bind(globalThis);

export function setHttpClient(client: typeof fetch): void {
  _fetch = client;
}

export function getHttpClient(): typeof fetch {
  return _fetch;
}
