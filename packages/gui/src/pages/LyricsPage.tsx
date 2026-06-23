import { usePlayer } from '../stores/playerStore';
import LyricsView from '../components/LyricsView';
import type { LyricLine } from '@core';

export default function LyricsPage() {
  const { currentTrack } = usePlayer();
  const lines: LyricLine[] = [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">🎤 歌词</h1>
        <div className="flex gap-2">
          <button className="px-3 py-1.5 rounded-lg bg-bg-medium border border-border text-sm hover:bg-bg-light">🔍 在线搜索</button>
          <button className="px-3 py-1.5 rounded-lg bg-bg-medium border border-border text-sm hover:bg-bg-light">📂 导入 .lrc</button>
        </div>
      </div>
      {lines.length > 0 ? (
        <LyricsView lines={lines} />
      ) : (
        <div className="text-center text-text-muted py-20">
          {currentTrack ? <><p className="text-lg mb-2">🎶 {currentTrack.title}</p><p className="text-sm">暂无歌词，点击上方按钮搜索</p></> : '播放歌曲后显示歌词'}
        </div>
      )}
    </div>
  );
}
