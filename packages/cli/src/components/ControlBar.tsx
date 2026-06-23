import React from 'react';
import { Box, Text } from 'ink';
import { PlaybackMode } from '../../../core/src/index.js';

const MODE_ICONS: Record<string, string> = {
  sequential: '🔁', shuffle: '🔀', repeat_one: '🔂', repeat_all: '🔄',
};

interface Props { state: string; volume: number; mode: PlaybackMode; position: number; duration: number; }

export default function ControlBar({ state, volume, mode, position, duration }: Props) {
  const icon = state === 'playing' ? '⏸' : '▶';
  const volIcon = volume === 0 ? '🔇' : volume < 33 ? '🔈' : volume < 66 ? '🔉' : '🔊';

  const posSec = position / 1000;
  const durSec = duration / 1000;
  const mins = Math.floor(posSec / 60), secs = Math.floor(posSec % 60);
  const tMins = Math.floor(durSec / 60), tSecs = Math.floor(durSec % 60);
  const barLen = 20;
  const filled = durSec > 0 ? Math.round((posSec / durSec) * barLen) : 0;
  const bar = '█'.repeat(filled) + '─'.repeat(barLen - filled);

  return (
    <Box paddingX={1} borderStyle="single" borderColor="gray" justifyContent="space-between">
      <Text> ⏮  {icon}  ⏭ </Text>
      <Text color="cyan">{String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')} {bar} {String(tMins).padStart(2, '0')}:{String(tSecs).padStart(2, '0')}</Text>
      <Text>{volIcon} {volume}%  {MODE_ICONS[mode]}</Text>
    </Box>
  );
}
