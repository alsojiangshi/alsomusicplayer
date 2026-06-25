import type { ReactNode } from 'react';
import { formatDuration, type Track } from '@core';

interface Props {
  tracks: Track[];
  onPlay?: (track: Track, index: number) => void;
  onDoubleClick?: (track: Track) => void;
  onRemoveFromPlaylist?: (track: Track) => void;
  renderActions?: (track: Track) => ReactNode;
  actionHeader?: string;
}

export default function SongTable({
  tracks,
  onPlay,
  onDoubleClick,
  onRemoveFromPlaylist,
  renderActions,
  actionHeader = '操作',
}: Props) {
  const showActions = Boolean(onRemoveFromPlaylist || renderActions);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-bg-darkest">
      <table className="w-full">
        <thead>
          <tr className="bg-bg-medium text-left text-xs font-medium text-text-secondary">
            <th className="w-8 px-3 py-2">#</th>
            <th className="px-3 py-2">标题</th>
            <th className="px-3 py-2">艺术家</th>
            <th className="px-3 py-2">专辑</th>
            <th className="w-16 px-3 py-2 text-right">时长</th>
            <th className="w-14 px-3 py-2 text-center">格式</th>
            {showActions && <th className="w-32 px-3 py-2 text-center">{actionHeader}</th>}
          </tr>
        </thead>
        <tbody>
          {tracks.map((track, index) => (
            <tr
              key={track.id}
              onDoubleClick={() => onDoubleClick?.(track)}
              onClick={() => onPlay?.(track, index)}
              className="cursor-pointer border-b border-border/50 transition-colors even:bg-bg-medium/30 hover:bg-bg-light"
            >
              <td className="px-3 py-1.5 text-xs text-text-muted">{index + 1}</td>
              <td className="max-w-[220px] truncate px-3 py-1.5 text-sm">{track.title}</td>
              <td className="max-w-[180px] truncate px-3 py-1.5 text-sm text-text-secondary">
                {track.artist}
              </td>
              <td className="max-w-[200px] truncate px-3 py-1.5 text-sm text-text-secondary">
                {track.album}
              </td>
              <td className="px-3 py-1.5 text-right text-xs text-text-muted">
                {formatDuration(track.duration || 0)}
              </td>
              <td className="px-3 py-1.5 text-center text-xs text-text-muted">{track.format}</td>
              {showActions && (
                <td className="px-2 py-1.5 text-center">
                  <div
                    className="flex items-center justify-center gap-1"
                    onClick={event => event.stopPropagation()}
                  >
                    {renderActions?.(track)}
                    {onRemoveFromPlaylist && (
                      <button
                        onClick={() => onRemoveFromPlaylist(track)}
                        className="rounded px-2 py-1 text-xs text-text-muted transition-colors hover:bg-red-900/30 hover:text-red-300"
                        title="从播放列表移除"
                      >
                        移除
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
