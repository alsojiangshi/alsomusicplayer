import React from 'react';
import { Box, Text } from 'ink';
import type { Track } from '../../../core/src/index.js';

interface Props { track: Track | null; position: number; duration: number; lyrics: string; }

export default function NowPlayingScreen({ track, position, duration, lyrics }: Props) {
  if (!track) return <Box padding={2}><Text dimColor>未在播放</Text></Box>;

  const posSec = position / 1000, durSec = duration / 1000;
  const mins = Math.floor(posSec / 60), secs = Math.floor(posSec % 60);
  const tMins = Math.floor(durSec / 60), tSecs = Math.floor(durSec % 60);
  const barLen = 30;
  const filled = durSec > 0 ? Math.round((posSec / durSec) * barLen) : 0;
  const bar = '█'.repeat(filled) + '─'.repeat(barLen - filled);

  return (
    <Box flexDirection="column" flexGrow={1} alignItems="center" paddingY={1}>
      <Text bold color="cyan">🎵 正在播放</Text>
      <Text bold>{track.title}</Text>
      <Text dimColor>{track.artist} — {track.album}</Text>
      <Box marginY={1}>
        <Text color="cyan">{String(mins).padStart(2,'0')}:{String(secs).padStart(2,'0')} {bar} {String(tMins).padStart(2,'0')}:{String(tSecs).padStart(2,'0')}</Text>
      </Box>
      {lyrics ? (
        <Box flexDirection="column" marginTop={1}>
          {lyrics.split('\n').slice(-6).map((line, i) => (
            <Text key={i} dimColor={i < 5}>{line.slice(0, 60)}</Text>
          ))}
        </Box>
      ) : (
        <Text dimColor>暂无歌词</Text>
      )}
    </Box>
  );
}
