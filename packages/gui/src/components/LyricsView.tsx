import { usePlayer } from '../stores/playerStore';
import type { LyricLine } from '../../../core/src/index.js';
import { useEffect, useRef } from 'react';

interface Props { lines: LyricLine[]; }

export default function LyricsView({ lines }: Props) {
  const { position } = usePlayer();
  const activeRef = useRef<HTMLDivElement>(null);
  const posSec = position / 1000;

  let activeIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= posSec) activeIdx = i;
  }

  useEffect(() => { activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, [activeIdx]);

  return (
    <div className="flex flex-col items-center py-8 gap-2 overflow-y-auto max-h-[60vh]">
      {lines.map((line, i) => (
        <div key={i} ref={i === activeIdx ? activeRef : null}
          className={`px-4 py-1 rounded text-center transition-all duration-300 ${
            i === activeIdx ? 'text-accent text-lg font-bold scale-105' :
            'text-text-muted text-sm'
          }`}>{line.text || '♪'}</div>
      ))}
    </div>
  );
}
