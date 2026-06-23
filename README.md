# 🎵 MusicPlayer

跨平台轻量音乐播放器，支持 Linux 和 Windows。

## 功能特性

- 🎧 **多格式支持** — WAV, OGG, MP3, FLAC, M4A, AAC, OPUS 等
- 🎤 **智能歌词** — 在线多源搜索 (LRCLIB + 网易云)，本地 .lrc/.txt 导入
- 📁 **多源导入** — 本地文件/文件夹、S3/MinIO 对象存储、OpenList 服务
- 🎨 **现代 UI** — 暗色主题、圆角设计、流畅动画
- 📋 **播放列表** — 创建/管理播放列表、收藏、播放历史
- 🔀 **播放模式** — 顺序、随机、单曲循环、列表循环
- ⌨️ **快捷键** — 空格播放/暂停、Ctrl+←→ 切歌、Ctrl+↑↓ 音量
- 📦 **便携版** — PyInstaller 打包，解压即用

## 快速开始

### 环境要求

- Python 3.11+
- `pip` 包管理器

### 安装

```bash
# 克隆项目
git clone <repo-url>
cd music-player

# 安装依赖
make install-deps
# 或
pip install -r requirements.txt --break-system-packages

# 初始化
make init
```

### 运行

```bash
# 方式 1：使用 Makefile
make run

# 方式 2：直接运行
python -m src.main
```

### 构建便携版

```bash
# Linux 便携版
make build-linux

# Windows 便携版
make build-windows

# 构建物：
#   dist/linux/MusicPlayer       — Linux 可执行文件
#   dist/windows/MusicPlayer.exe — Windows 可执行文件
```

## 使用指南

### 1. 导入音乐

#### 本地导入
1. 点击左侧「＋ 导入音乐」按钮
2. 选择「本地文件/文件夹」
3. 添加音乐文件或整个文件夹
4. 点击「开始导入」

#### S3/MinIO 导入
1. 先在「设置 → S3 存储」中配置连接信息：
   - Endpoint（如 `http://localhost:9000`）
   - Access Key / Secret Key
   - Bucket 名称、Prefix 前缀
2. 在导入对话框中选择「S3 / MinIO 存储」
3. 点击「开始导入」

#### OpenList 导入
1. 先在「设置 → OpenList」中配置：
   - 服务器地址（如 `http://localhost:5244`）
   - 用户名 / 密码
2. 在导入对话框中选择「OpenList 服务」
3. 指定远程路径
4. 点击「开始导入」

### 2. 在线歌词

- 播放歌曲时自动搜索歌词
- 在「歌词」页面可以手动搜索或导入本地 .lrc 文件
- 支持带节奏的同步歌词（LRC 格式）和纯文本歌词

### 3. 播放列表

- 创建自定义播放列表
- 向播放列表添加/移除歌曲
- 支持将歌曲「添加到队列」进行临时播放

### 4. 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Space` | 播放/暂停 |
| `Ctrl + →` | 下一首 |
| `Ctrl + ←` | 上一首 |
| `Ctrl + ↑` | 音量 + |
| `Ctrl + ↓` | 音量 - |
| `Ctrl + M` | 静音 |
| `Ctrl + I` | 导入音乐 |

## 项目结构

```
music-player/
├── src/                        # 源代码
│   ├── main.py                 # 入口点
│   ├── app.py                  # 应用控制器
│   ├── config.py               # 配置管理
│   ├── database.py             # 数据库 ORM
│   ├── core/                   # 核心模块
│   │   ├── audio_engine.py     # 音频播放引擎
│   │   ├── playlist_engine.py  # 播放队列管理
│   │   └── library_manager.py  # 音乐库管理
│   ├── ui/                     # 用户界面
│   │   ├── main_window.py      # 主窗口
│   │   ├── player_bar.py       # 播放控制栏
│   │   ├── library_page.py     # 音乐库页面
│   │   ├── playlist_page.py    # 播放列表页面
│   │   ├── lyrics_page.py      # 歌词页面
│   │   ├── settings_page.py    # 设置页面
│   │   ├── import_dialog.py    # 导入对话框
│   │   ├── theme.py            # 暗色主题
│   │   └── components/         # 可复用组件
│   ├── lyrics/                 # 歌词模块
│   │   ├── lyrics_manager.py   # 歌词管理器
│   │   ├── lrc_parser.py       # LRC 解析器
│   │   └── providers/          # 歌词提供者
│   │       ├── lrclib.py       # LRCLIB.net
│   │       ├── netease.py      # 网易云音乐
│   │       └── local_file.py   # 本地文件
│   ├── importers/              # 导入器
│   │   ├── local_importer.py   # 本地导入
│   │   ├── s3_importer.py      # S3 导入
│   │   └── openlist_importer.py # OpenList 导入
│   └── utils/                  # 工具函数
│       ├── metadata.py         # 音频元数据
│       ├── file_utils.py       # 文件工具
│       └── workers.py          # 后台线程
├── resources/                  # 资源文件
├── build/                      # PyInstaller 构建配置
├── requirements.txt
├── Makefile
└── README.md
```

## 技术栈

| 层面 | 技术选型 |
|------|----------|
| 语言 | Python 3.11+ |
| GUI | PySide6 (Qt 6) |
| 音频 | QMediaPlayer + mutagen |
| 数据库 | SQLite + FTS5 |
| S3 | boto3 |
| 打包 | PyInstaller |

## License

MIT
