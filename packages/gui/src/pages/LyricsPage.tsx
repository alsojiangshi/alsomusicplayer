import { useState, useEffect, useRef } from 'react';
import { usePlayer } from '../stores/playerStore';
import LyricsView from '../components/LyricsView';
import { LyricsManager, LRCParser, LRCLibProvider, NeteaseProvider } from '@core';
import type { LyricLine } from '@core';

export default function LyricsPage() {
  const { currentTrack, libraryManager } = usePlayer();
  const [lines, setLines] = useState<LyricLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  // 初始化 LyricsManager（useEffect 中，不污染 render）
  const lyricsRef = useRef<LyricsManager | null>(null);
  useEffect(() => {
    if (libraryManager && !lyricsRef.current) {
      lyricsRef.current = new LyricsManager(libraryManager);
      lyricsRef.current.registerProvider('lrclib', new LRCLibProvider());
      lyricsRef.current.registerProvider('netease', new NeteaseProvider());
    }
  }, [libraryManager]);

  useEffect(() => {
    if (!currentTrack || !libraryManager) {
      setLines([]);
      return;
    }

    let cancelled = false;

    const loadLyrics = async () => {
      setLoading(true);
      setStatusMsg('搜索歌词中...');

      try {
        // 1. 查缓存（使用 LyricsManager.getCached — 它正确映射 snake_case → camelCase）
        const cached = lyricsRef.current?.getCached(currentTrack.id);
        if (cancelled) return;

        if (cached && (cached.syncedText || cached.plainText)) {
          const parsed = LRCParser.parse(cached.syncedText || cached.plainText || '');
          setLines(parsed);
          setStatusMsg(`来源: ${cached.source}`);
          setLoading(false);
          return;
        }

        // 2. 在线搜索
        if (!lyricsRef.current) return;
        const result = await lyricsRef.current.searchOnline(
          currentTrack.title,
          currentTrack.artist,
          currentTrack.album,
          currentTrack.duration
        );
        if (cancelled) return;

        if (result) {
          const parsed = result.syncedText
            ? LRCParser.parse(result.syncedText)
            : result.plainText
              ? [{ time: 0, text: result.plainText }]
              : [];
          setLines(parsed);
          setStatusMsg(`来源: ${result.source}`);

          // 缓存到数据库
          libraryManager.cacheLyrics(currentTrack.id, {
            source: result.source,
            plainText: result.plainText,
            syncedText: result.syncedText,
            language: result.language || 'original',
          });
        } else {
          // 在线搜索失败，保留已有歌词（不清空）
          setStatusMsg('未找到歌词');
        }
      } catch (e: any) {
        if (!cancelled) {
          // 网络错误也保留已有歌词
          setStatusMsg(`加载失败: ${e?.message || '未知错误'}`);
        }
      }
      if (!cancelled) setLoading(false);
    };

    loadLyrics();
    return () => { cancelled = true; };
  }, [currentTrack?.id, libraryManager]);

  // 手动重新搜索
  const handleSearch = async () => {
    if (!currentTrack || !libraryManager || !lyricsRef.current) return;
    setLoading(true);
    setStatusMsg('重新搜索...');
    try {
      const result = await lyricsRef.current.searchOnline(
        currentTrack.title,
        currentTrack.artist,
        currentTrack.album,
        currentTrack.duration
      );
      if (result) {
        const parsed = result.syncedText
          ? LRCParser.parse(result.syncedText)
          : result.plainText
            ? [{ time: 0, text: result.plainText }]
            : [];
        setLines(parsed);
        setStatusMsg(`来源: ${result.source}`);
        libraryManager.cacheLyrics(currentTrack.id, {
          source: result.source,
          plainText: result.plainText,
          syncedText: result.syncedText,
          language: result.language || 'original',
        });
      } else {
        setStatusMsg('未找到歌词');
      }
    } catch {
      setStatusMsg('搜索失败，请检查网络');
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">🎤 歌词</h1>
        <div className="flex gap-2">
          {currentTrack && (
            <button
              onClick={handleSearch}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg bg-bg-medium border border-border text-sm hover:bg-bg-light disabled:opacity-50"
            >
              {loading ? '⏳' : '🔍'} 重新搜索
            </button>
          )}
        </div>
      </div>

      {!currentTrack ? (
        <div className="text-center text-text-muted py-20">
          <p className="text-lg">播放歌曲后自动搜索歌词</p>
        </div>
      ) : loading ? (
        <div className="text-center text-text-muted py-20">
          <p className="text-lg mb-2">🎶 {currentTrack.title}</p>
          <div className="animate-pulse">{statusMsg}</div>
        </div>
      ) : lines.length > 0 ? (
        <>
          {statusMsg && <div className="text-xs text-text-muted text-center">{statusMsg}</div>}
          <LyricsView lines={lines} />
        </>
      ) : (
        <div className="text-center text-text-muted py-20">
          <p className="text-lg mb-2">🎶 {currentTrack.title}</p>
          <p className="text-sm">{statusMsg || '暂未获取到歌词，点击上方按钮重新搜索'}</p>
        </div>
      )}
    </div>
  );
}
