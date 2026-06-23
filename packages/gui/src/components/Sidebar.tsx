const NAV = ['📚 音乐库', '📋 播放列表', '🎤 歌词', '⚙️ 设置'];

interface Props { currentPage: number; onNavigate: (i: number) => void; }

export default function Sidebar({ currentPage, onNavigate }: Props) {
  return (
    <nav className="w-52 bg-bg-darkest border-r border-border flex flex-col p-3 gap-1">
      <div className="text-lg font-bold text-accent px-3 py-2 mb-4">🎵 MusicPlayer</div>
      {NAV.map((label, i) => (
        <button
          key={i}
          onClick={() => onNavigate(i)}
          className={`text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
            i === currentPage ? 'bg-accent-dim text-accent' : 'text-text-secondary hover:bg-bg-light hover:text-text-primary'
          }`}
        >
          {label}
        </button>
      ))}
      <div className="mt-auto pt-4">
        <button className="w-full px-3 py-2 rounded-lg bg-accent-dim text-accent border border-accent/30 hover:bg-accent hover:text-bg-darkest transition-colors text-sm">
          ＋ 导入音乐
        </button>
      </div>
    </nav>
  );
}
