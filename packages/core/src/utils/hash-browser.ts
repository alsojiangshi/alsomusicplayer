/** 浏览器安全哈希 - 纯 Web Crypto API，零 Node.js 依赖 */

export async function computeHashFromBlob(data: Uint8Array): Promise<string> {
  const buffer = data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength,
  ) as ArrayBuffer;
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
