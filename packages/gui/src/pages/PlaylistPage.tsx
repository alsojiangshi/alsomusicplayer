export default function PlaylistPage() {
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">📋 播放列表</h1>
      <div className="flex gap-4">
        <div className="w-64 bg-bg-darkest border border-border rounded-xl p-4 space-y-2">
          <button className="w-full text-left px-3 py-2 rounded-lg bg-accent-dim text-accent text-sm">＋ 新建播放列表</button>
          <div className="text-sm text-text-muted text-center py-8">暂无播放列表</div>
        </div>
        <div className="flex-1">
          <div className="text-sm text-text-muted text-center py-16">选择一个播放列表查看歌曲</div>
        </div>
      </div>
    </div>
  );
}
