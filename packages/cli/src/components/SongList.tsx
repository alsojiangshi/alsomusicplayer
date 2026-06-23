import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { useInput } from 'ink';
import type { Track } from '@music-player/core';

interface Props { tracks: Track[]; onPlay: (t: Track, idx: number) => void; onPlayAll: () => void; }

export default function SongList({ tracks, onPlay, onPlayAll }: Props) {
  const [cursor, setCursor] = useState(0);
  const [filter, setFilter] = useState('');

  const filtered = filter
    ? tracks.filter(t =>
        (t.title||'').toLowerCase().includes(filter.toLowerCase()) ||
        (t.artist||'').toLowerCase().includes(filter.toLowerCase()))
    : tracks;

  useInput((input, key) => {
    if (key.upArrow) setCursor(c => Math.max(0, c - 1));
    if (key.downArrow) setCursor(c => Math.min((filtered.length || 1) - 1, c + 1));
    if (key.return && filtered[cursor]) onPlay(filtered[cursor], tracks.indexOf(filtered[cursor]));
    if (input === 'a') onPlayAll();
    if (input.length === 1 && !key.upArrow && !key.downArrow && !key.return) {
      setFilter(f => f + input);
    }
    if (key.backspace || key.delete) setFilter(f => f.slice(0, -1));
    if (key.escape) setFilter('');
  });

  const start = Math.max(0, cursor - 8);
  const visible = filtered.slice(start, start + 16);

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box marginY={1} paddingX={1}>
        <Text bold>📚 音乐库</Text>
        <Text dimColor>  [{filtered.length}首]</Text>
        {filter && <Text color="yellow"> 搜索: {filter}</Text>}
      </Box>
      <Box flexDirection="column">
        {visible.map((t, i) => {
          const idx = start + i;
          const isActive = idx === cursor;
          const mins = Math.floor((t.duration || 0) / 60);
          const secs = Math.floor((t.duration || 0) % 60);
          return (
            <Box key={t.id} paddingX={1}>
              <Text color={isActive ? 'cyan' : undefined} inverse={isActive}>
                {isActive ? '▶' : ' '} {(t.title||'?').slice(0, 35).padEnd(35)} {(t.artist||'?').slice(0, 20).padEnd(20)} {String(mins).padStart(2,'0')}:{String(secs).padStart(2,'0')}
              </Text>
            </Box>
          );
        })}
        {filtered.length === 0 && <Box paddingX={2}><Text dimColor>没有歌曲。请使用 GUI 版导入音乐。</Text></Box>}
      </Box>
    </Box>
  );
}
