import { useEffect, useMemo, useState } from 'react';
import type { DesktopLyricsSnapshot } from '@core';
import { buildStrings } from './i18n';
import { commands, listenEvent } from './tauri';

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
  const [snapshot, setSnapshot] = useState<DesktopLyricsSnapshot>(initialState);

  useEffect(() => {
    let cleanup = () => {};
    void (async () => {
      cleanup = await listenEvent<DesktopLyricsSnapshot>('desktopLyrics:state', payload => {
        setSnapshot(payload);
      });
      await commands.setDesktopLyricsVisible(true).catch(() => undefined);
    })();

    return () => {
      cleanup();
    };
  }, []);

  return (
    <div className="desktop-lyrics-window">
      <div className="desktop-lyrics-shell">
        <div className="muted tiny">
          <div>{snapshot.title || initialState.title}</div>
          <div>{snapshot.artist || initialState.artist}</div>
        </div>

        <div className="desktop-lyrics-lines">
          <div className="desktop-line-main">{snapshot.currentLine || '...'}</div>
          <div className="desktop-line-next">{snapshot.nextLine || ' '}</div>
        </div>

        <div className="desktop-lyrics-actions">
          <button className="icon-button" onClick={() => void commands.transport('previous')}>
            {'<<'}
          </button>
          <button className="icon-button" onClick={() => void commands.transport('toggle')}>
            {snapshot.isPlaying ? '||' : '>'}
          </button>
          <button className="icon-button" onClick={() => void commands.transport('next')}>
            {'>>'}
          </button>
        </div>
      </div>
    </div>
  );
}
