# Windows 本地产物测试

这个项目可以在 Windows 本地直接测试，不需要每次都等 GitHub Actions，但前提是本机 Rust 工具链必须足够新。

## 环境要求

- Node.js 22+
- `pnpm`
- Rust stable，且 `cargo` 版本明显高于 `1.82.0`

推荐先执行：

```bash
rustup update stable
rustup default stable
cargo -V
rustc -V
```

验收重点不是“必须最新”，而是本机 `cargo` 已经能支持当前依赖要求的 `edition2024`。

## 日常开发回路

平时开发优先走桌面开发模式，不要每次改完都先打包。

```bash
pnpm install
pnpm dev
```

这一层主要验证：

- 界面行为
- 播放器主流程
- Tauri 命令
- Windows SMTC
- 托盘行为
- 桌面歌词
- 删除当前播放曲目后的状态一致性

## 发布态验证

快速本地 release 构建：

```bash
pnpm build:tauri:local
```

这条命令会跳过 NSIS 安装器打包，快速在 `packages/gui/src-tauri/target/release/` 里产出 release 可执行文件。

如果要在本地生成和 CI 同布局的 portable zip：

```bash
pnpm package:portable:local
```

需要完整验证安装器路径时，再执行：

```bash
pnpm build:tauri
```

`pnpm build:tauri` 会走完整安装包流程，但前提是当前机器能正常下载 NSIS bundler 资源。

## 产物位置

安装包输出位置：

- `packages/gui/src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/*.exe`

release 运行目录：

- `packages/gui/src-tauri/target/x86_64-pc-windows-msvc/release/`

做便携版等价验证时，先直接从 `release` 目录启动可执行文件，不要只单独拎出一个 `.exe`。这个目录里包含了程序运行时需要挨着放置的依赖文件。

## Portable 打包规则

如果你要手工模拟 portable zip，必须沿用 CI 的目录规则，不能只打一个 `also-music-player.exe`。

至少要一起带上：

- `also-music-player.exe`
- `*.dll`
- `*.pak`
- `*.dat`
- `*.bin`
- `*.json`
- `locales/`
- `resources/`

## 推荐验收顺序

1. `pnpm dev` 能正常打开主窗口。
2. `pnpm build:tauri:local` 能成功完成。
3. `release` 目录中的可执行文件能直接启动。
4. `pnpm package:portable:local` 生成的 portable zip 解压后也能启动。
5. 需要验证安装器时，再检查 `pnpm build:tauri` 和 NSIS 安装包。

只有这 5 步都通过后，再把 GitHub Actions 当成最终的 Windows/Linux 发版兜底，而不是替代你的日常本地验证。
