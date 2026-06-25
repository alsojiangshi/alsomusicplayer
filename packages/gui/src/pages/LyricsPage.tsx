import { useEffect, useRef, useState } from 'react';
import { LRCParser, LRCLibProvider, LyricsManager, NeteaseProvider, type LyricLine } from '@core';
import LyricsView from '../components/LyricsView';
import { usePlayer } from '../stores/playerStore';

export default function LyricsPage() {
  const { currentTrack, libraryManager, cacheLyrics } = usePlayer();
  const [lines, setLines] = useState<LyricLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const lyricsRef = useRef<LyricsManager | null>(null);

  useEffect(() => {
    if (libraryManager && !lyricsRef.current) {
      const manager = new LyricsManager(libraryManager);
      manager.registerProvider('lrclib', new LRCLibProvider());
      manager.registerProvider('netease', new NeteaseProvider());
      lyricsRef.current = manager;
    }
  }, [libraryManager]);

  useEffect(() => {
    if (!currentTrack || !libraryManager) {
      setLines([]);
      setStatusMessage('');
      return;
    }

    let cancelled = false;

    const loadLyrics = async () => {
      setLoading(true);
      setStatusMessage('正在搜索歌词...');

      try {
        const cached = lyricsRef.current?.getCached(currentTrack.id);
        if (cancelled) {
          return;
        }

        if (cached && (cached.syncedText || cached.plainText)) {
          setLines(parseLyrics(cached.syncedText || cached.plainText || ''));
          setStatusMessage(`来源：${cached.source}`);
          setLoading(false);
          return;
        }

        if (!lyricsRef.current) {
          return;
        }

        const result = await lyricsRef.current.searchOnline(
          currentTrack.title,
          currentTrack.artist,
          currentTrack.album,
          currentTrack.duration,
        );
        if (cancelled) {
          return;
        }

        if (result) {
          setLines(parseLyrics(result.syncedText || result.plainText || ''));
          setStatusMessage(`来源：${result.source}`);
          cacheLyrics(currentTrack.id, {
            source: result.source,
            plainText: result.plainText,
            syncedText: result.syncedText,
            language: result.language || 'original',
          });
        } else {
          setLines([]);
          setStatusMessage('没有找到歌词');
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setStatusMessage(
            error instanceof Error ? `加载失败：${error.message}` : '加载歌词失败',
          );
        }
      }

      if (!cancelled) {
        setLoading(false);
      }
    };

    void loadLyrics();

    return () => {
      cancelled = true;
    };
  }, [cacheLyrics, currentTrack?.id, libraryManager]);

  const handleSearch = async () => {
    if (!currentTrack || !lyricsRef.current) {
      return;
    }

    setLoading(true);
    setStatusMessage('重新搜索歌词...');

    try {
      const result = await lyricsRef.current.searchOnline(
        currentTrack.title,
        currentTrack.artist,
        currentTrack.album,
        currentTrack.duration,
      );

      if (result) {
        setLines(parseLyrics(result.syncedText || result.plainText || ''));
        setStatusMessage(`来源：${result.source}`);
        cacheLyrics(currentTrack.id, {
          source: result.source,
          plainText: result.plainText,
          syncedText: result.syncedText,
          language: result.language || 'original',
        });
      } else {
        setLines([]);
        setStatusMessage('没有找到歌词');
      }
    } catch {
      setStatusMessage('搜索失败，请检查网络后重试');
    }

    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">🎤 歌词</h1>
        {currentTrack && (
          <button
            onClick={handleSearch}
            disabled={loading}
            className="rounded-lg border border-border bg-bg-medium px-3 py-1.5 text-sm hover:bg-bg-light disabled:opacity-50"
          >
            {loading ? '搜索中...' : '重新搜索'}
          </button>
        )}
      </div>

      {!currentTrack ? (
        <div className="py-20 text-center text-text-muted">
          <p className="text-lg">开始播放一首歌后，这里会自动加载歌词。</p>
        </div>
      ) : loading ? (
        <div className="py-20 text-center text-text-muted">
          <p className="mb-2 text-lg">🎶 {currentTrack.title}</p>
          <div className="animate-pulse">{statusMessage}</div>
        </div>
      ) : lines.length > 0 ? (
        <>
          {statusMessage && <div className="text-center text-xs text-text-muted">{statusMessage}</div>}
          <LyricsView lines={lines} />
        </>
      ) : (
        <div className="py-20 text-center text-text-muted">
          <p className="mb-2 text-lg">🎶 {currentTrack.title}</p>
          <p className="text-sm">{statusMessage || '暂时没有找到歌词。'}</p>
        </div>
      )}
    </div>
  );
}

function parseLyrics(content: string): LyricLine[] {
  return LRCParser.parse(content);
}
