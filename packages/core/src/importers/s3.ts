/** S3/MinIO 导入器 */

import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { LibraryManager } from '../library/manager.js';
import { extractMetadata, isSupportedAudio } from '../utils/metadata.js';
import type { S3Config } from '../types.js';
import { BaseImporter } from './base.js';
import { getDataDir } from '../config.js';

export class S3Importer extends BaseImporter {
  constructor(library: LibraryManager) { super(library); }

  async import(params: {
    config: S3Config;
    maxFiles?: number;
    onProgress?: (pct: number, msg: string) => void;
  }): Promise<number> {
    const { config, maxFiles = 500, onProgress } = params;

    const client = new S3Client({
      endpoint: config.endpoint.startsWith('http') ? config.endpoint : `http${config.useSsl ? 's' : ''}://${config.endpoint}`,
      credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
      region: config.region,
      forcePathStyle: true,
    });

    if (onProgress) onProgress(0, '连接 S3...');

    // 列出对象
    const objects: { key: string; size: number }[] = [];
    let token: string | undefined;
    while (objects.length < maxFiles) {
      const cmd = new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: config.prefix,
        MaxKeys: Math.min(1000, maxFiles - objects.length),
        ContinuationToken: token,
      });
      const resp = await client.send(cmd);
      for (const obj of resp.Contents ?? []) {
        if (obj.Key && obj.Size && obj.Size > 0 && isSupportedAudio(obj.Key)) {
          objects.push({ key: obj.Key, size: obj.Size });
        }
      }
      if (!resp.IsTruncated) break;
      token = resp.NextContinuationToken;
    }

    if (onProgress) onProgress(5, `发现 ${objects.length} 个文件`);

    const cacheDir = join(getDataDir(), 'cache', 's3');
    mkdirSync(cacheDir, { recursive: true });

    let imported = 0;
    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i];
      this.report(i + 1, objects.length, obj.key.split('/').pop()!, onProgress);

      try {
        const localPath = join(cacheDir, obj.key.replace(/\//g, '_'));
        if (!existsSync(localPath)) {
          const getCmd = new GetObjectCommand({ Bucket: config.bucket, Key: obj.key });
          const resp = await client.send(getCmd);
          const body = await resp.Body?.transformToByteArray();
          if (body) writeFileSync(localPath, body);
        }

        if (existsSync(localPath)) {
          const meta = await extractMetadata(localPath);
          meta.filePath = `s3://${config.bucket}/${obj.key}`;
          meta.source = 's3';
          meta.sourceConfig = JSON.stringify({ endpoint: config.endpoint, bucket: config.bucket });
          const id = this.library.addSong(meta);
          if (id) imported++;
        }
      } catch { /* skip failed */ }
    }

    if (onProgress) onProgress(100, `完成！成功导入 ${imported}/${objects.length}`);
    return imported;
  }
}
