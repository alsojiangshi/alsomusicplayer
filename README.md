# 🎵 MusicPlayer

跨平台轻量音乐播放器，支持 Linux 与 Windows。

**TypeScript + Tauri v2 + React 18 + ink** — 工程级代码质量，产物极致轻量。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## 架构

```
packages/
├── core/       @music-player/core   共享引擎（类型 / 数据库 / 歌词 / 导入器）
├── gui/        @music-player/gui    Tauri v2 + React 18 + Tailwind CSS 桌面端
└── cli/        @music-player/cli    ink (React for CLI) 终端 TUI
```

```
┌──────────────────────────────────────┐
│         @music-player/core           │
│  Database · LibraryManager           │
│  PlaylistEngine · LyricsManager      │
│  Importers · AudioBackend 接口       │
└──────────┬──────────────┬───────────┘
           │              │
    ┌──────┘              └──────┐
    ▼                            ▼
┌──────────────┐         ┌────────────────┐
│  GUI (Tauri) │         │  CLI (ink)     │
│  HTML5 Audio │         │  模拟音频后端   │
│  ~8MB 产物   │         │  ~60MB 产物    │
└──────────────┘         └────────────────┘
```

## 产物对比

| 产物 | 技术 | 体积 |
|------|------|------|
| `MusicPlayer-cli-linux` | bun `--compile` | ~60MB |
| `MusicPlayer-cli-windows.exe` | bun 交叉编译 | ~60MB |
| `MusicPlayer-gui-linux` | Tauri v2 + AppImage | ~8MB |
| `MusicPlayer-gui-windows.exe` | Tauri v2 + MSVC | ~10MB |

CLI 较大是因为打包了 bun 运行时。GUI 极致轻量——Linux 借助 WebKit2GTK 系统库，Windows 利用内置 WebView2。

## 功能

- 🎧 **多格式支持** — WAV, OGG, MP3, FLAC, M4A, AAC, OPUS, WMA
- 🎤 **在线歌词** — LRCLIB.net + 网易云音乐双源搜索与缓存
- 📁 **多源导入** — 本地文件 / 直链 URL / S3 (MinIO) / OpenList API
- 🎨 **暗色主题** — Tailwind CSS 自定义 GitHub 风格配色
- 🔀 **4 种播放模式** — 顺序 / 随机 / 单曲循环 / 列表循环
- 📋 **播放列表管理** — 收藏、历史记录、队列管理
- 📦 **6 种便携产物** — CLI / GUI × Linux / Windows，解压即用

## 快速开始

### 环境要求

- [bun](https://bun.sh) ≥ 1.3
- GUI 开发需要 [Rust](https://rustup.rs) + WebKit2GTK 开发库（仅 Linux）

```bash
# 安装 bun
curl -fsSL https://bun.sh/install | bash

# 克隆并安装依赖
git clone <repo-url> && cd music-player
bun install
```

### 开发

```bash
bun run dev:cli          # CLI 终端版（ink TUI，端口自动）
bun run dev:gui          # GUI 桌面版（Vite dev server，端口 1420）
```

CLI 键盘快捷键：

| 键 | 功能 | 键 | 功能 |
|----|------|----|------|
| `Space` | 播放/暂停 | `m` | 静音切换 |
| `n` / `>` | 下一首 | `s` | 随机模式 |
| `p` / `<` | 上一首 | `r` | 循环切换 |
| `+` / `=` | 音量增加 | `-` | 音量减少 |
| `1` | 浏览歌曲库 | `2` | 正在播放 |
| 直接打字 | 过滤搜索 | `Esc` | 退出 |

### 构建

```bash
# CLI 二进制（单文件，无外部依赖）
bun run build:cli:linux
bun run build:cli:windows

# GUI 桌面应用
bun run build:gui            # 仅前端（Vite）
bun run build:gui:tauri      # 完整桌面应用（需 Rust + 系统库）
```

### Linux GUI 构建前置依赖

```bash
sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev \
  libayatana-appindicator3-dev librsvg2-dev libsoup-3.0-dev \
  libjavascriptcoregtk-4.1-dev patchelf
```

## 技术栈

| 层 | 技术 |
|----|------|
| 语言 | TypeScript 5.x strict |
| GUI 框架 | Tauri v2 (Rust 后端) + React 18 |
| CLI 框架 | ink 7.x (React for terminal) |
| 样式 | Tailwind CSS 3.x 暗色主题 |
| 运行时 | bun 1.3+ |
| 数据库 | sql.js 1.x (SQLite WASM，零原生依赖) |
| 元数据 | music-metadata 11.x |
| S3 | @aws-sdk/client-s3 3.x |
| 状态管理 (GUI) | React Context + useRef |
| 构建 (CLI) | `bun build --compile` |
| 构建 (GUI) | Vite + `tauri-apps/tauri-action@v0` (CI) |

## 项目结构

```
├── packages/
│   ├── core/src/
│   │   ├── types.ts              Track、Playlist、LyricsData 等核心类型
│   │   ├── config.ts             JSON 配置文件读写
│   │   ├── database/db.ts        sql.js 封装（6 表 schema）
│   │   ├── library/manager.ts    歌曲/播放列表/收藏/历史 CRUD
│   │   ├── playlist/engine.ts    队列引擎 + 4 播放模式
│   │   ├── lyrics/               LRCParser + LyricsManager + 3 个 Provider
│   │   ├── importers/            Local / S3 / OpenList 导入器
│   │   ├── audio/                AudioBackend 接口 + TypedEmitter
│   │   └── utils/                格式化、哈希、元数据提取
│   │
│   ├── gui/src/
│   │   ├── components/           Layout, Sidebar, PlayerBar, SongTable, ImportModal...
│   │   ├── pages/                Library, Playlist, Lyrics, Settings
│   │   ├── stores/playerStore    React Context 播放器状态
│   │   ├── audio/html5-backend   HTML5 AudioElement 后端
│   │   └── styles/globals.css    Tailwind + 自定义滚动条
│   │
│   └── cli/src/
│       ├── app.tsx               主组件（DB 初始化、键盘处理、界面切换）
│       ├── audio/backend.ts      模拟音频后端（计时 + mutagen 时长）
│       ├── components/           Header, StatusBar, ControlBar, SongList
│       └── screens/              NowPlayingScreen
│
├── .github/workflows/build.yml   CI 自动构建 4 产物 + GitHub Release
├── package.json                  扁平依赖（非 workspace 链接）
└── tsconfig.base.json            共享 TS strict 配置
```

## 数据流

```
ImportModal / 拖拽导入
  → playerStore.addTracks()
    → allTracks state
      → LibraryPage 展示
      → PlayerBar.setQueue(tracks)
        → Audio 播放
```

## CI/CD

推送 `v*` tag 自动触发 `.github/workflows/build.yml`：4 个并行构建 job → 聚合发布到 GitHub Releases。

```bash
git tag v1.0.0 && git push --tags
```

## 路线图

- [ ] GUI 歌曲库持久化（接入 sql.js）
- [ ] 歌词页面与 core 歌词引擎对接
- [ ] ImportModal 添加 S3 / OpenList Tab
- [ ] CLI 接入实际音频播放（ffplay / 系统播放器）
- [ ] 音频文件内嵌封面提取
- [ ] TypeScript 测试覆盖

## License

MIT © MusicPlayer Contributors
