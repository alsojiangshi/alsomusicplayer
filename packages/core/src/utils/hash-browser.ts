/** 浏览器安全哈希 — 纯 Web Crypto API，零 Node.js 依赖 */

export async function computeHashFromBlob(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
