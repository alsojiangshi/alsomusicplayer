/** MD5 文件哈希工具 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export function computeFileHash(filePath: string): string {
  try {
    const data = readFileSync(filePath);
    return createHash('md5').update(data).digest('hex');
  } catch {
    return '';
  }
}

export function computeHashFromBuffer(buffer: Uint8Array): string {
  return createHash('md5').update(buffer).digest('hex');
}
