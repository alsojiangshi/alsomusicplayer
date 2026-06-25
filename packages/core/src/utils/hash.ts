/** SHA-256 文件哈希工具，保持 Node 与浏览器端一致 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export function computeFileHash(filePath: string): string {
  try {
    const data = readFileSync(filePath);
    return createHash('sha256').update(data).digest('hex');
  } catch {
    return '';
  }
}

export function computeHashFromBuffer(buffer: Uint8Array): string {
  return createHash('sha256').update(buffer).digest('hex');
}
