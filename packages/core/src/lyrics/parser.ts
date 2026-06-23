/** LRC 歌词解析器 */

export interface LyricLine {
  time: number;  // seconds
  text: string;
}

export class LRCParser {
  private static TIME_RE = /\[(\d{2}):(\d{2})(?:\.(\d{1,3}))?\]/g;
  private static META_RE = /\[([a-z]+):(.+?)\]/i;
  private static WORD_RE = /<\d{2}:\d{2}(?:\.\d{1,3})?>/g;

  static parse(lrc: string): LyricLine[] {
    const lines = lrc.trim().split('\n');
    const result: LyricLine[] = [];
    let hasTimestamps = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (LRCParser.META_RE.test(trimmed)) continue;

      const timestamps: { m: number; s: number; ms: number }[] = [];
      let match;
      const timeRegex = /\[(\d{2}):(\d{2})(?:\.(\d{1,3}))?\]/g;
      while ((match = timeRegex.exec(trimmed)) !== null) {
        timestamps.push({ m: +match[1], s: +match[2], ms: match[3] ? +match[3].padEnd(3, '0').slice(0, 3) : 0 });
      }

      if (timestamps.length > 0) {
        hasTimestamps = true;
        let text = trimmed.replace(/\[\d{2}:\d{2}(?:\.\d{1,3})?\]/g, '').trim();
        text = text.replace(LRCParser.WORD_RE, '').trim();
        for (const ts of timestamps) {
          result.push({ time: ts.m * 60 + ts.s + ts.ms / 1000, text });
        }
      } else if (trimmed && !trimmed.startsWith('[')) {
        result.push({ time: 0, text: trimmed });
      }
    }

    if (!hasTimestamps) {
      return lrc.trim().split('\n').filter(l => l.trim()).map(text => ({ time: 0, text: text.trim() }));
    }

    result.sort((a, b) => a.time - b.time);
    return result;
  }

  static isSynced(lrc: string): boolean {
    return /\[\d{2}:\d{2}/.test(lrc);
  }

  static parseToPlain(lrc: string): string {
    return lrc
      .replace(/\[\d{2}:\d{2}(?:\.\d{1,3})?\]/g, '')
      .replace(LRCParser.WORD_RE, '')
      .replace(/\[[a-z]+:.+?\]/gi, '')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .join('\n');
  }
}
