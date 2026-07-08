import { useEffect, useState } from 'react';
import type { DesktopLyricsSnapshot } from '@core';
import { commands, listenEvent } from './tauri';

const INITIAL_STATE: DesktopLyricsSnapshot = {
  title: 'AlsoMusicPlayer',
  artist: 'Desktop Lyrics',
  currentLine: 'Play a track to start desktop lyrics.',
  nextLine: 'You can control playback from this floating window.',
  isPlaying: false,
};

export default function DesktopLyricsWindow() {
  const [snapshot, setSnapshot] = useState<DesktopLyricsSnapshot>(INITIAL_STATE);

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
          <div>{snapshot.title || 'AlsoMusicPlayer'}</div>
          <div>{snapshot.artist || 'Desktop Lyrics'}</div>
        </div>

        <div className="desktop-lyrics-lines">
          <div className="desktop-line-main">{snapshot.currentLine || '...'}</div>
          <div className="desktop-line-next">{snapshot.nextLine || ' '}</div>
        </div>

        <div className="desktop-lyrics-actions">
          <button className="icon-button" onClick={() => void commands.transport('previous')}>
            ◀
          </button>
          <button className="icon-button" onClick={() => void commands.transport('toggle')}>
            {snapshot.isPlaying ? '❚❚' : '▶'}
          </button>
          <button className="icon-button" onClick={() => void commands.transport('next')}>
            ▶
          </button>
        </div>
      </div>
    </div>
  );
}
