export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">⚙️ 设置</h1>
      <div className="grid grid-cols-2 gap-6">
        <section className="bg-bg-darkest border border-border rounded-xl p-5">
          <h2 className="font-bold mb-3">音频</h2>
          <div className="space-y-3 text-sm">
            <label className="flex items-center gap-3"><span className="w-20 text-text-secondary">默认音量</span><input type="range" className="flex-1" defaultValue={80} /></label>
            <label className="flex items-center gap-3"><span className="w-20 text-text-secondary">输出设备</span><select className="bg-bg-medium border border-border rounded px-2 py-1 flex-1"><option>系统默认</option></select></label>
          </div>
        </section>
        <section className="bg-bg-darkest border border-border rounded-xl p-5">
          <h2 className="font-bold mb-3">歌词</h2>
          <div className="space-y-3 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" defaultChecked /> 自动搜索歌词</label>
            <label className="flex items-center gap-2"><input type="checkbox" defaultChecked /> 优先本地歌词</label>
          </div>
        </section>
        <section className="bg-bg-darkest border border-border rounded-xl p-5">
          <h2 className="font-bold mb-3">S3 存储</h2>
          <div className="space-y-2 text-sm">
            <input placeholder="Endpoint" className="w-full bg-bg-medium border border-border rounded px-2 py-1" />
            <input placeholder="Access Key" className="w-full bg-bg-medium border border-border rounded px-2 py-1" />
            <input placeholder="Secret Key" type="password" className="w-full bg-bg-medium border border-border rounded px-2 py-1" />
            <input placeholder="Bucket" className="w-full bg-bg-medium border border-border rounded px-2 py-1" />
          </div>
        </section>
        <section className="bg-bg-darkest border border-border rounded-xl p-5">
          <h2 className="font-bold mb-3">OpenList</h2>
          <div className="space-y-2 text-sm">
            <input placeholder="服务器地址" className="w-full bg-bg-medium border border-border rounded px-2 py-1" />
            <input placeholder="用户名" className="w-full bg-bg-medium border border-border rounded px-2 py-1" />
            <input placeholder="密码" type="password" className="w-full bg-bg-medium border border-border rounded px-2 py-1" />
          </div>
        </section>
      </div>
    </div>
  );
}
