# AlsoMusicPlayer

[English](./README.md) | [简体中文](./README.zh-CN.md)

AlsoMusicPlayer 是一个以桌面体验为核心、围绕本地媒体库工作流重构的音乐播放器。当前交付物只包含 GUI 版本，重点覆盖来源感知曲目模型、歌单、播放队列、同步歌词、桌面歌词、Windows SMTC，以及 Windows / Linux 的自动化打包链路。

## 概览

- `Tauri v2 + React + TypeScript`
- 来源感知曲目模型：`local_file`、`direct_url`、`resolver`
- 本地媒体库原位索引，不复制音频文件到应用目录
- 歌单、播放队列、同步歌词、桌面歌词窗口
- Windows SMTC，接入系统媒体键和系统媒体浮层
- GitHub Actions 自动打包 Windows / Linux GUI 版本

## 架构

```text
packages/
  core/   共享领域类型、播放/会话辅助逻辑、歌词解析器、格式化工具
  gui/    React 桌面界面 + Tauri 宿主层 + 原生 SQLite 后端
```

当前这次重构的关键设计决策：

- 当前产品目标是 GUI 桌面应用，CLI 暂时不进入发布链路。
- Tauri 宿主层负责扫描、SQLite 持久化、托盘、桌面歌词生命周期、会话存储和来源解析。
- 前端负责界面表现和 HTML5 Audio 播放引擎，再把播放状态同步回宿主层。
- 手动编辑的曲目信息会写入应用数据库覆盖层，而不是回写本地音频标签。

## 语言与美术资产

GUI 当前支持：

- `English`
- `简体中文`
- 默认 `跟随系统`

界面语言会保存在现有 `sessions` 存储中的 `ui_settings` 键下。

应用与托盘图标资产路径：

- `packages/gui/src-tauri/icons/icon.png`
  - 必需
  - 透明背景 PNG
  - 建议尺寸：`1024x1024`
- `packages/gui/src-tauri/icons/icon.ico`
  - Windows 打包必需
  - 多尺寸 ICO
  - 建议至少包含 `16/24/32/48/64/128/256`
- `packages/gui/src-tauri/icons/tray-icon.ico`
  - 可选的 Windows 托盘专用图标
  - 建议多尺寸 ICO，并优先保证 `16/20/24/32` 清晰
- `packages/gui/src-tauri/icons/tray-icon.png`
  - 可选的 Linux 托盘专用图标
  - 建议透明 PNG，`32x32` 或 `64x64`

如果没有提供托盘专用图标，当前会回退到主应用图标。

## 版本号

当你要升级产品版本号时，请至少同步这 3 个文件：

- `packages/gui/package.json`
- `packages/gui/src-tauri/Cargo.toml`
- `packages/gui/src-tauri/tauri.conf.json`

当前 CI 会校验像 `v1.4.7` 这样的 tag 是否和 GUI 打包版本完全一致。

## 开发

环境要求：

- Node.js 22+
- `pnpm`
- Rust stable（CI 使用）
- Linux 构建额外需要 WebKitGTK 系统库

安装与启动：

```bash
pnpm install
pnpm dev
```

检查命令：

```bash
pnpm typecheck
pnpm test:core
cargo test --manifest-path packages/gui/src-tauri/Cargo.toml
```

## CI 发布

当前 GitHub Actions 只围绕 GUI 版本，覆盖：

- TypeScript 类型检查
- 共享核心测试
- Rust 测试
- Windows 打包
- Linux 打包

打 tag 发布后，会输出更产品化的文件名，例如：

- `AlsoMusicPlayer-gui-v1.4.7-windows-x64-setup.exe`
- `AlsoMusicPlayer-gui-v1.4.7-windows-x64-portable.zip`
- `AlsoMusicPlayer-gui-v1.4.7-linux-x64-appimage.AppImage`

非 tag 构建会使用 `dev-<run_number>` 后缀。

## 当前本地环境说明

当前工作区的 TypeScript 侧可以正常验证。Rust 侧在某些本地机器上仍可能被较旧的 Cargo 工具链卡住，因为新的传递依赖已经开始要求比 `cargo 1.82.0` 更高的 Cargo manifest 支持能力。如果你的本地 Cargo 较旧，Rust 侧校验请以 CI 结果为准。

## 致谢

感谢 [Sonorbit](https://github.com/Violexjj/Loop-Sound-Player) 项目提供的部分灵感与参考方向。
