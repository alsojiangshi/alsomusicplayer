# 🎵 MusicPlayer

跨平台轻量音乐播放器 — Linux / Windows。同时提供 CLI/TUI 和 GUI 两种前端，共享核心引擎。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Build](https://github.com/alsojiangshi/alsomusicplayer/actions/workflows/build.yml/badge.svg)](https://github.com/alsojiangshi/alsomusicplayer/actions/workflows/build.yml)

## 功能特性

- 🎧 **多格式支持** — WAV, OGG, MP3, FLAC, M4A, AAC, OPUS 等
- 🎤 **智能歌词** — 在线多源搜索 (LRCLIB + 网易云)，本地 .lrc/.txt 导入
- 📁 **多源导入** — 本地文件/文件夹、S3/MinIO 对象存储、OpenList 服务
- 🎨 **双前端** — 终端 TUI (textual) + 图形 GUI (PySide6)，共享同一核心引擎
- 📋 **播放列表** — 创建/管理播放列表、收藏、播放历史
- 🔀 **播放模式** — 顺序、随机、单曲循环、列表循环
- 📦 **6 种便携版** — CLI / GUI / CLI+GUI × Linux / Windows

## 快速开始

### 环境要求

- Python 3.11+
- Linux: `libegl1 libgl1 gstreamer` 等多媒体库

### 安装 & 运行

```bash
git clone https://github.com/alsojiangshi/alsomusicplayer.git
cd alsomusicplayer

pip install -r requirements.txt --break-system-packages
```

```bash
# CLI/TUI 终端版
python src/main.py --cli

# GUI 图形界面版
python src/main.py --gui

# 自动选择（有桌面环境则 GUI，否则 CLI）
python src/main.py
```

### 构建便携版

```bash
# 当前平台全量构建 (3 个变体)
python build/build.py

# 仅 Linux / 仅 GUI
python build/build.py --linux --variant gui

# 产物结构：
#   dist/linux/
#     MusicPlayer-cli-linux      — CLI/TUI 终端版
#     MusicPlayer-gui-linux       — GUI 图形界面版
#     MusicPlayer-full-linux      — CLI + GUI 合一版
#   dist/windows/
#     MusicPlayer-cli-windows.exe
#     MusicPlayer-gui-windows.exe
#     MusicPlayer-full-windows.exe
```

### 一键构建 & 发布 (CI)

```bash
git tag v1.0.0 && git push --tags
```

GitHub Actions 自动构建 6 个产物并发布到 Releases。

## 项目结构

```
src/
├── main.py          # 合一入口 (--cli / --gui)
├── main_cli.py      # CLI 专属入口
├── main_gui.py      # GUI 专属入口
├── config.py        # 配置管理
├── database.py      # SQLite + FTS5
├── core/            # 共享核心引擎
│   ├── audio_engine.py
│   ├── playlist_engine.py
│   └── library_manager.py
├── gui/             # GUI 前端 (PySide6)
│   ├── main_window.py
│   ├── player_bar.py
│   ├── library_page.py
│   ├── lyrics_page.py
│   └── ...
├── cli/             # CLI/TUI 前端 (textual)
│   ├── app.py
│   ├── screens/
│   ├── widgets/
│   └── styles.tcss
├── lyrics/          # 歌词系统
│   ├── lrc_parser.py
│   └── providers/
│       ├── lrclib.py
│       ├── netease.py
│       └── local_file.py
├── importers/       # 多源导入
│   ├── local_importer.py
│   ├── s3_importer.py
│   └── openlist_importer.py
└── utils/
```

## 快捷键

| 快捷键 | GUI | TUI | 功能 |
|--------|-----|-----|------|
| `Space` | ✅ | ✅ | 播放/暂停 |
| `Ctrl+→` / `→` | ✅ | ✅ | 下一首 |
| `Ctrl+←` / `←` | ✅ | ✅ | 上一首 |
| `Ctrl+M` / `m` | ✅ | ✅ | 静音 |
| `F1` | — | ✅ | 浏览音乐库 |
| `F2` | — | ✅ | 正在播放 |
| `q` | — | ✅ | 退出 |
| `Ctrl+I` | ✅ | ✅ | 导入音乐 |

## 技术栈

| 层面 | 技术 |
|------|------|
| GUI 前端 | PySide6 (Qt 6) |
| TUI 前端 | textual |
| 音频引擎 | QMediaPlayer + mutagen |
| 数据库 | SQLite + FTS5 |
| S3 | boto3 |
| 打包 | PyInstaller |

## License

[MIT](LICENSE)
