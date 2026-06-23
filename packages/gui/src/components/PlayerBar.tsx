import { usePlayer } from '../stores/playerStore';
import { formatDuration } from '../../../core/src/index.js';
import CoverArt from './CoverArt';
import SeekSlider from './SeekSlider';
import { PlaybackMode } from '../../../core/src/index.js';

const MODE_ICONS: Record<string, string> = {
  sequential: '🔁', shuffle: '🔀', repeat_one: '🔂', repeat_all: '🔄',
};

export default function PlayerBar() {
  const { currentTrack, state, volume, mode, duration, position, togglePlay, next, prev, setVolume, toggleMute, cycleMode } = usePlayer();

  return (
    <div className="h-20 bg-bg-darkest border-t border-border flex items-center px-4 gap-4 flex-shrink-0">
      {/* Track info */}
      <div className="flex items-center gap-3 w-56">
        <CoverArt size={48} />
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{currentTrack?.title || '未在播放'}</div>
          <div className="text-xs text-text-secondary truncate">{currentTrack?.artist || ''}</div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex-1 flex flex-col items-center gap-1 max-w-xl mx-auto">
        <div className="flex items-center gap-3">
          <button onClick={cycleMode} className="text-text-secondary hover:text-text-primary w-7 h-7 flex items-center justify-center text-sm">{MODE_ICONS[mode] || '🔁'}</button>
          <button onClick={prev} className="text-text-secondary hover:text-text-primary text-lg">⏮</button>
          <button onClick={togglePlay} className="w-10 h-10 rounded-full bg-accent text-bg-darkest flex items-center justify-center hover:bg-accent-hover text-lg">
            {state === 'playing' ? '⏸' : '▶'}
          </button>
          <button onClick={next} className="text-text-secondary hover:text-text-primary text-lg">⏭</button>
          <button className="text-text-secondary hover:text-text-primary text-sm">🎤</button>
        </div>
        <div className="flex items-center gap-2 w-full">
          <span className="text-xs text-text-muted w-10 text-right">{formatDuration(position / 1000)}</span>
          <SeekSlider />
          <span className="text-xs text-text-muted w-10">{formatDuration(duration / 1000)}</span>
        </div>
      </div>

      {/* Volume */}
      <div className="flex items-center gap-2 w-40 justify-end">
        <button onClick={toggleMute} className="text-text-secondary text-sm">
          {volume === 0 ? '🔇' : volume < 33 ? '🔈' : volume < 66 ? '🔉' : '🔊'}
        </button>
        <input type="range" min={0} max={100} value={volume} onChange={e => setVolume(+e.target.value)}
          className="w-20 h-1 bg-bg-light rounded appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent" />
      </div>
    </div>
  );
}
