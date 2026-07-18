import { useEffect, useMemo, useState } from 'react';
import type { DesktopLyricsSnapshot } from '@core';
import { buildStrings } from './i18n';
import {
  DEFAULT_SHORTCUTS,
  isTextEditingTarget,
  shortcutAction,
  shortcutFromKeyboardEvent,
} from './shortcuts';
import { commands, listenEvent, type ShortcutSettings } from './tauri';

function buildInitialState(): DesktopLyricsSnapshot {
  const language = typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh')
    ? 'zh-CN'
    : 'en-US';
  const strings = buildStrings(language);
  return {
    title: strings.common.appName,
    artist: strings.desktopWindow.defaultArtist,
    currentLine: strings.desktopWindow.defaultCurrentLine,
    nextLine: strings.desktopWindow.defaultNextLine,
    isPlaying: false,
  };
}

export default function DesktopLyricsWindow() {
  const initialState = useMemo(() => buildInitialState(), []);
  const strings = useMemo(() => buildStrings(
    navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US',
  ), []);
  const [snapshot, setSnapshot] = useState<DesktopLyricsSnapshot>(initialState);
  const [shortcuts, setShortcuts] = useState<ShortcutSettings>(DEFAULT_SHORTCUTS);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add('desktop-lyrics-document');
    return () => document.documentElement.classList.remove('desktop-lyrics-document');
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('desktop-lyrics-locked', locked);
    return () => document.documentElement.classList.remove('desktop-lyrics-locked');
  }, [locked]);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    void listenEvent<DesktopLyricsSnapshot>('desktopLyrics:state', payload => {
      if (!disposed) {
        setSnapshot(payload);
      }
    }).then(unlisten => {
      if (disposed) {
        unlisten();
      } else {
        cleanup = unlisten;
      }
    }).catch(() => undefined);
    void commands.getDesktopLyrics().then(current => {
      if (!disposed) setSnapshot(current);
    }).catch(() => undefined);

    return () => {
      disposed = true;
      cleanup();
    };
  }, [initialState]);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    void listenEvent<boolean>('desktopLyrics:lock', nextLocked => {
      if (!disposed) setLocked(nextLocked);
    }).then(unlisten => {
      if (disposed) unlisten();
      else cleanup = unlisten;
    }).catch(() => undefined);
    void commands.getDesktopLyricsLocked().then(nextLocked => {
      if (!disposed) setLocked(nextLocked);
    }).catch(() => undefined);
    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    const synchronize = async () => {
      const next = await commands.loadShortcuts().catch(() => null);
      if (!disposed && next) setShortcuts(next);
    };
    void synchronize();
    const interval = window.setInterval(synchronize, 500);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || isTextEditingTarget(event.target)) return;
      const shortcut = shortcutFromKeyboardEvent(event);
      const action = shortcut ? shortcutAction(shortcuts, shortcut) : null;
      if (!action) return;
      event.preventDefault();
      if (action === 'toggle-desktop-lyrics') {
        void commands.toggleDesktopLyrics().catch(() => undefined);
      } else if (action === 'toggle-desktop-lyrics-lock') {
        void commands.toggleDesktopLyricsLock().then(setLocked).catch(() => undefined);
      } else {
        void commands.transport(action).catch(() => undefined);
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [shortcuts]);

  return (
    <div className={`desktop-lyrics-window ${locked ? 'is-locked' : ''}`}>
      <div className={`desktop-lyrics-shell ${locked ? 'is-locked' : ''}`} data-tauri-drag-region>
        <div className="muted tiny desktop-lyrics-metadata">
          <div>{snapshot.title || initialState.title}</div>
          <div>{snapshot.artist || initialState.artist}</div>
        </div>

        <div className="desktop-lyrics-lines">
          <div className="desktop-line-main">{snapshot.currentLine || '...'}</div>
          <div className="desktop-line-next">{snapshot.nextLine || ' '}</div>
        </div>

        <div className="desktop-lyrics-actions">
          <button className="icon-button" onClick={() => void commands.transport('previous').catch(() => undefined)}>
            {'<<'}
          </button>
          <button className="icon-button" onClick={() => void commands.transport('toggle').catch(() => undefined)}>
            {snapshot.isPlaying ? '||' : '>'}
          </button>
          <button className="icon-button" onClick={() => void commands.transport('next').catch(() => undefined)}>
            {'>>'}
          </button>
          <button
            className="icon-button"
            onClick={() => void commands.toggleDesktopLyricsLock().then(setLocked).catch(() => undefined)}
            title={strings.desktopWindow.lock}
            aria-label={strings.desktopWindow.lock}
          >
            🔒
          </button>
        </div>
      </div>
    </div>
  );
}
