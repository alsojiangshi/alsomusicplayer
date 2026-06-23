import React from 'react';
import { Box, Text } from 'ink';

export default function Header() {
  return (
    <Box paddingX={1} paddingY={0}>
      <Text bold color="cyan">🎵 MusicPlayer</Text>
      <Text dimColor> — Terminal Edition</Text>
    </Box>
  );
}
