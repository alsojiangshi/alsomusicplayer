import type { Track } from '@core';
import { formatDuration } from '@core';

interface Props {
  tracks: Track[];
  onPlay?: (track: Track, index: number) => void;
  onDoubleClick?: (track: Track) => void;
  onRemoveFromPlaylist?: (track: Track) => void;
}

export default function SongTable({ tracks, onPlay, onDoubleClick, onRemoveFromPlaylist }: Props) {
  const showActions = !!onRemoveFromPlaylist;

  return (
    <div className="bg-bg-darkest border border-border rounded-xl overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-bg-medium text-text-secondary text-xs font-medium">
            <th className="py-2 px-3 text-left w-8">#</th>
            <th className="py-2 px-3 text-left">标题</th>
            <th className="py-2 px-3 text-left">艺术家</th>
            <th className="py-2 px-3 text-left">专辑</th>
            <th className="py-2 px-3 text-right w-16">时长</th>
            <th className="py-2 px-3 text-center w-14">格式</th>
            {showActions && <th className="py-2 px-3 text-center w-10"></th>}
          </tr>
        </thead>
        <tbody>
          {tracks.map((t, i) => (
            <tr key={t.id}
              onDoubleClick={() => onDoubleClick?.(t)}
              onClick={() => onPlay?.(t, i)}
              className="border-b border-border/50 hover:bg-bg-light cursor-pointer transition-colors even:bg-bg-medium/30">
              <td className="py-1.5 px-3 text-xs text-text-muted">{i + 1}</td>
              <td className="py-1.5 px-3 text-sm truncate max-w-[200px]">{t.title}</td>
              <td className="py-1.5 px-3 text-sm text-text-secondary truncate max-w-[160px]">{t.artist}</td>
              <td className="py-1.5 px-3 text-sm text-text-secondary truncate max-w-[180px]">{t.album}</td>
              <td className="py-1.5 px-3 text-xs text-text-muted text-right">{formatDuration(t.duration || 0)}</td>
              <td className="py-1.5 px-3 text-xs text-text-muted text-center">{t.format}</td>
              {showActions && (
                <td className="py-1.5 px-1 text-center">
                  <button
                    onClick={e => { e.stopPropagation(); onRemoveFromPlaylist?.(t); }}
                    className="px-1.5 py-0.5 rounded text-xs text-text-muted hover:text-red-400 hover:bg-red-900/30 transition-colors"
                    title="从播放列表移除"
                  >✕</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
