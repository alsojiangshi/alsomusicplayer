export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '00:00';
  }

  const rounded = Math.floor(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainSeconds = rounded % 60;

  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(remainSeconds)}`;
  }

  return `${pad(minutes)}:${pad(remainSeconds)}`;
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

export function safeFilename(input: string): string {
  return input.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').trim();
}

export function formatAvailability(value: 'available' | 'missing' | 'unresolved'): string {
  if (value === 'missing') {
    return 'Missing';
  }
  if (value === 'unresolved') {
    return 'Needs Resolve';
  }
  return 'Available';
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}
