/** 格式化工具函数 */

export function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0) return '00:00';
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(sec)}`;
  return `${pad(m)}:${pad(sec)}`;
}

export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  for (const unit of units) {
    if (size < 1024) return `${size.toFixed(1)} ${unit}`;
    size /= 1024;
  }
  return `${size.toFixed(1)} TB`;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

export function safeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').trim();
}
