import React from 'react';
import { Box, Text } from 'ink';
import { PlaybackMode } from '../../../core/src/index.js';

const MODE_STR: Record<string, string> = {
  sequential: '🔁 顺序', shuffle: '🔀 随机', repeat_one: '🔂 单曲', repeat_all: '🔄 全部',
};

interface Props { text: string; mode: PlaybackMode; count: number; }

export default function StatusBar({ text, mode, count }: Props) {
  return (
    <Box paddingX={1} borderStyle="single" borderColor="gray">
      <Text>{text}</Text>
      <Text dimColor>  |  {MODE_STR[mode] || '🔁'}  |  {count} 首</Text>
    </Box>
  );
}
