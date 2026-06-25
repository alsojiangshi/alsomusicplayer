import { formatDuration } from '@core';
import CoverArt from './CoverArt';
import SeekSlider from './SeekSlider';
import { usePlayer } from '../stores/playerStore';

const MODE_ICONS: Record<string, string> = {
  sequential: '➡️',
  shuffle: '🔀',
  repeat_one: '🔂',
  repeat_all: '🔁',
};

interface Props {
  onShowLyrics: () => void;
}

export default function PlayerBar({ onShowLyrics }: Props) {
  const {
    currentTrack,
    state,
    volume,
    muted,
    mode,
    duration,
    position,
    togglePlay,
    next,
    prev,
    setVolume,
    toggleMute,
    cycleMode,
  } = usePlayer();

  return (
    <div className="flex h-20 flex-shrink-0 items-center gap-4 border-t border-border bg-bg-darkest px-4">
      <div className="flex w-56 items-center gap-3">
        <CoverArt size={48} />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            {currentTrack?.title || '还没有开始播放'}
          </div>
          <div className="truncate text-xs text-text-secondary">
            {currentTrack?.artist || '拖入音乐后就能开始'}
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-xl flex-1 flex-col items-center gap-1">
        <div className="flex items-center gap-3">
          <button
            onClick={cycleMode}
            className="flex h-7 w-7 items-center justify-center text-sm text-text-secondary hover:text-text-primary"
            title="切换播放模式"
          >
            {MODE_ICONS[mode] || '➡️'}
          </button>
          <button
            onClick={prev}
            className="text-lg text-text-secondary hover:text-text-primary"
            title="上一首"
          >
            ⏮
          </button>
          <button
            onClick={togglePlay}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-lg text-bg-darkest hover:bg-accent-hover"
            title={state === 'playing' ? '暂停' : '播放'}
          >
            {state === 'playing' ? '⏸' : '▶'}
          </button>
          <button
            onClick={next}
            className="text-lg text-text-secondary hover:text-text-primary"
            title="下一首"
          >
            ⏭
          </button>
          <button
            onClick={onShowLyrics}
            className="text-sm text-text-secondary hover:text-text-primary"
            title="查看歌词"
          >
            🎤
          </button>
        </div>
        <div className="flex w-full items-center gap-2">
          <span className="w-10 text-right text-xs text-text-muted">
            {formatDuration(position / 1000)}
          </span>
          <SeekSlider />
          <span className="w-10 text-xs text-text-muted">
            {formatDuration(duration / 1000)}
          </span>
        </div>
      </div>

      <div className="flex w-40 items-center justify-end gap-2">
        <button onClick={toggleMute} className="text-sm text-text-secondary" title="静音">
          {muted || volume === 0 ? '🔇' : volume < 33 ? '🔈' : volume < 66 ? '🔉' : '🔊'}
        </button>
        <input
          type="range"
          min={0}
          max={100}
          value={volume}
          onChange={event => setVolume(Number(event.target.value))}
          className="h-1 w-20 appearance-none rounded bg-bg-light [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent"
        />
      </div>
    </div>
  );
}
