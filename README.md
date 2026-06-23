# 🎵 MusicPlayer

跨平台轻量音乐播放器 — Linux / Windows。

**TypeScript + Tauri + React + ink** — 工程级代码质量，产物极致轻量。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## 架构

```
packages/
├── core/       @music-player/core   共享逻辑（零 UI 依赖）
├── gui/        @music-player/gui    Tauri v2 + React 18 + Tailwind
└── cli/        @music-player/cli    ink (React for CLI) + bun compile
```

| 产物 | 技术 | 体积 |
|------|------|------|
| MusicPlayer-cli-linux | bun --compile | ~60MB |
| MusicPlayer-cli-windows.exe | bun --compile | ~60MB |
| MusicPlayer-gui-linux | Tauri | ~8MB |
| MusicPlayer-gui-windows.exe | Tauri | ~10MB |

> 对比 Python 版: 单一产物 ~80MB。TS 版 GUI 仅 ~8MB。

## 快速开始

```bash
# 安装
curl -fsSL https://bun.sh/install | bash
bun install

# 开发
bun run dev:cli    # CLI/TUI 终端版
bun run dev:gui    # GUI 图形界面版

# 构建
bun run build:cli:linux
bun run build:gui:linux

# 测试
bun test
```

## 功能

- 🎧 WAV, OGG, MP3, FLAC, M4A 等多格式
- 🎤 LRCLIB + 网易云在线歌词
- 📁 本地 / S3/MinIO / OpenList 多源导入
- 🎨 现代暗色主题 (Tailwind)
- 📋 播放列表管理
- 🔀 4 种播放模式
- 📦 6 种便携版 (CLI/GUI/Full × Linux/Windows)

## CI 发布

```bash
git tag v1.0.0 && git push --tags
```

## License

MIT
