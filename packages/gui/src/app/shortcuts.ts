import type { ShortcutSettings, TransportAction } from './tauri';

export const DEFAULT_SHORTCUTS: ShortcutSettings = {
  togglePlayPause: 'Space',
  nextTrack: 'Ctrl+Right',
  previousTrack: 'Ctrl+Left',
  toggleDesktopLyrics: 'Ctrl+L',
  toggleDesktopLyricsLock: '',
};

interface KeyboardShortcutEvent {
  key: string;
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

export function shortcutFromKeyboardEvent(event: KeyboardShortcutEvent): string | null {
  if (isModifierKey(event.key)) {
    return null;
  }

  const key = shortcutKeyLabel(event.code, event.key);
  if (!key) {
    return null;
  }

  const parts: string[] = [];
  if (event.ctrlKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  if (event.metaKey) parts.push('Meta');
  parts.push(key);
  return parts.join('+');
}

export function shortcutAction(
  settings: ShortcutSettings,
  shortcut: string,
): TransportAction | null {
  const normalized = shortcut.toLowerCase();
  if (settings.togglePlayPause.toLowerCase() === normalized) return 'toggle';
  if (settings.nextTrack.toLowerCase() === normalized) return 'next';
  if (settings.previousTrack.toLowerCase() === normalized) return 'previous';
  if (settings.toggleDesktopLyrics.toLowerCase() === normalized) {
    return 'toggle-desktop-lyrics';
  }
  if (
    settings.toggleDesktopLyricsLock
    && settings.toggleDesktopLyricsLock.toLowerCase() === normalized
  ) {
    return 'toggle-desktop-lyrics-lock';
  }
  return null;
}

export function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.isContentEditable
    || target.matches('input, textarea, select, [role="textbox"]')
    || Boolean(target.closest('[contenteditable="true"]'));
}

export function duplicateShortcuts(settings: ShortcutSettings): Set<keyof ShortcutSettings> {
  const entries = Object.entries(settings) as Array<[keyof ShortcutSettings, string]>;
  const duplicates = new Set<keyof ShortcutSettings>();
  for (const [key, value] of entries) {
    if (!value) continue;
    for (const [otherKey, otherValue] of entries) {
      if (key !== otherKey && value.toLowerCase() === otherValue.toLowerCase()) {
        duplicates.add(key);
      }
    }
  }
  return duplicates;
}

function shortcutKeyLabel(code: string, key: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return code;
  if (code.startsWith('Arrow')) return code.slice(5);
  if (code === 'Space' || key === ' ') return 'Space';

  const namedKeys: Record<string, string> = {
    Esc: 'Escape',
    Escape: 'Escape',
    Enter: 'Enter',
    Tab: 'Tab',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Insert: 'Insert',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
  };
  if (namedKeys[key]) return namedKeys[key];
  if (/^F\d{1,2}$/.test(key)) return key;
  return key.length === 1 ? key.toUpperCase() : code || key;
}

function isModifierKey(key: string): boolean {
  return ['Control', 'Alt', 'Shift', 'Meta', 'AltGraph'].includes(key);
}
