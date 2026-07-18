# AlsoMusicPlayer

[English](./README.md) | [简体中文](./README.zh-CN.md)

## 简述

AlsoMusicPlayer 是一款围绕索引式、本地优先媒体库构建的桌面音乐播放器。项目支持的交付形态是 Windows 与 Linux 上的 Tauri v2 GUI：React、TypeScript、Vite 与 Zustand 负责界面和播放状态，Rust 宿主负责原生窗口、文件系统访问、元数据扫描、SQLite 持久化以及需要网络的来源解析。

本地音频保留在原始位置，不会复制到应用存储目录。项目采用 [MIT License](./LICENSE) 授权。

## 功能

- **本地媒体库索引：**通过文件选择器或拖放导入单个文件，也可递归扫描文件夹。扫描器识别 MP3、FLAC、WAV、OGG/OGA、M4A/MP4、AAC、Opus、WMA 和 AIFF/AIF；能否实际播放取决于所在平台 WebView 的编解码能力。
- **元数据与封面：**读取时长、标签、码率、采样率、声道、内嵌封面、同名图片及常见文件夹封面；内嵌封面会提取到应用缓存。
- **多种曲目来源：**播放已索引的本地文件和音频直链，也可搜索网易云音乐并保存解析型曲目。远程播放依赖网络以及上游来源是否仍可用。
- **媒体库维护：**记住导入目录以便刷新、标记缺失的本地文件、在系统文件管理器中定位本地曲目、搜索曲库，以及只删除曲库记录而不删除源音频。
- **非破坏性编辑：**在 SQLite 中覆盖标题、艺术家、专辑、作曲、时长、封面引用和歌词，不回写原始音频标签。
- **歌单与队列：**创建、重命名和删除歌单，添加或移除曲目，恢复播放队列和进度，并支持顺序、随机、单曲循环与列表循环。
- **歌词：**加载手动录入歌词、同名本地 `.lrc` 或 LRCLIB 搜索结果，缓存在线结果，在主窗口显示同步歌词，并在 Windows 与 Linux 上提供置顶桌面歌词窗口。
- **桌面集成：**关闭主窗口时隐藏到系统托盘，可从托盘菜单控制播放；当系统 WebView 支持时，通过 Web Media Session API 提供媒体元数据及播放/暂停、上一首、下一首处理。
- **语言与存储：**界面支持 English、简体中文和跟随系统。安装版将 SQLite 数据及缓存写入 Tauri 应用数据目录；Windows 便携包通过 `portable.json` 将数据保存在可执行文件旁的 `data/` 中。

## 架构

```text
@music-player/core
  领域类型、播放/会话归一化、界面语言辅助函数、
  格式化工具与 LRC 解析
                         │
                         ▼
React + Zustand 前端 ── Tauri 命令/事件 ── Rust 宿主
  界面与 HTMLAudioElement                    ├─ 文件系统 + lofty 元数据
  队列与播放状态                            ├─ rusqlite 内置 SQLite
  同步歌词渲染                              ├─ HTTP 来源/歌词解析
  Web Media Session 集成                    └─ 托盘 + 桌面歌词窗口
```

- GUI 将 `@core` 解析到 `packages/core/src/browser.ts`，只暴露桌面前端需要的浏览器安全共享模型与纯函数。
- `packages/gui/src/app/App.tsx` 是生效的 React 入口。Zustand 管理界面和播放快照，`PlaybackService` 驱动 `HTMLAudioElement`、播放队列、会话同步与 Media Session 元数据。
- `packages/gui/src-tauri/src/` 中的 Tauri 宿主通过命令和事件提供扫描、歌单、信息覆盖、歌词、会话、来源解析、托盘操作和桌面歌词能力。
- Rust 管理的 SQLite 数据库存储媒体库根目录、扫描所得曲目信息、用户覆盖信息、歌单、歌词缓存和会话值。便携标记只改变数据根目录，不改变数据库模型。

## 仓库目录树及说明

```text
.
├─ .github/
│  ├─ scripts/release-meta.mjs       # 版本校验与产物命名
│  └─ workflows/build.yml            # 校验、Windows/Linux 构建与发布
├─ docs/                              # Windows 本地产物测试指南
├─ packages/
│  ├─ core/
│  │  ├─ src/browser.ts              # 生效的浏览器安全导出面
│  │  ├─ src/{types,track,ui}.ts      # 共享领域模型与归一化逻辑
│  │  ├─ src/lyrics/parser.ts         # GUI 使用的 LRC 解析器
│  │  ├─ src/{database,importers,...} # 保留的 Node 侧实现
│  │  └─ test/track.test.ts           # 生效的 Node 测试集
│  ├─ gui/
│  │  ├─ src/app/                     # 生效的 React UI、状态、桥接与播放逻辑
│  │  ├─ src/styles/                  # 桌面主窗口与歌词窗口样式
│  │  ├─ src-tauri/src/               # Rust 宿主与 SQLite 实现
│  │  ├─ src-tauri/{icons,capabilities}/
│  │  └─ vite.config.ts               # Vite 构建与 @core 别名
│  └─ cli/                            # 保留的 Ink/Bun TUI 源码；不参与发布
├─ scripts/package-windows-portable.ps1
│                                      # 本地便携 ZIP 打包脚本
├─ tests/                              # 旧 Python 测试；不在生效的 CI 中
├─ Makefile                            # 旧 Python 阶段的命令
├─ requirements.txt                    # 旧 Python 依赖清单
├─ package.json                        # 生效的根级开发、检查与构建命令
├─ pnpm-workspace.yaml                 # 只包含 packages/core 与 packages/gui
└─ tsconfig.base.json                  # 共享 TypeScript 编译配置
```

受支持的工作区、根级命令与 CI 只构建 `packages/core` 和 `packages/gui`。`packages/cli`、根目录 Python 测试、`Makefile` 与 `requirements.txt` 是保留源码或历史文件，不是受支持的产品入口。

## 开发环境要求

- Node.js 22（与 CI 基线一致）。
- pnpm 9.15.0，由根目录 `packageManager` 字段声明；可通过 `corepack enable` 使用项目指定的 pnpm。
- 较新的 Rust stable 工具链，以及能够处理采用 Rust 2024 edition 元数据依赖项的 Cargo。
- 参照 [Tauri v2 前置要求](https://v2.tauri.app/zh-cn/start/prerequisites/) 安装平台依赖：
  - Windows：MSVC Rust target、勾选 **Desktop development with C++** 的 Microsoft C++ Build Tools，以及 Microsoft Edge WebView2。
  - Linux：C/C++ 构建工具链、WebKitGTK 4.1 及相关开发库。Ubuntu 22.04 CI 会安装 `libwebkit2gtk-4.1-dev`、`libgtk-3-dev`、`libayatana-appindicator3-dev`、`librsvg2-dev`、`libsoup-3.0-dev`、`libjavascriptcoregtk-4.1-dev` 和 `patchelf`。

安装依赖并启动完整桌面应用：

```bash
pnpm install
pnpm --dir packages/gui tauri:dev
```

根目录的 `pnpm dev` 只启动供 Tauri 使用的 Vite 开发服务器；媒体库、数据库、托盘和文件系统等宿主能力必须通过 `tauri:dev` 使用。

运行全部检查或单项检查：

```bash
pnpm test

pnpm typecheck
pnpm test:core
pnpm test:rust
```

构建前端或打包桌面应用：

```bash
pnpm build
pnpm build:tauri
```

Windows 还提供 `pnpm build:tauri:local`，用于生成不含安装器的 release 可执行文件；`pnpm package:portable:local` 可生成本地便携 ZIP。详见 [Windows 本地产物测试](./docs/local-windows-testing.zh-CN.md)。

## CI 要求

`Desktop Build` 工作流在拉取请求、`v*` 标签推送和手动触发时运行；普通的非标签分支推送不会触发该工作流。

- `validate` 在 Ubuntu 22.04 上使用 Node.js 22 与 Rust stable，校验发布元数据，安装 Linux Tauri 库，执行 `pnpm install --frozen-lockfile=false`、TypeScript 类型检查、core Node 测试与 Rust 测试。
- `build-linux` 依赖校验任务，构建 `x86_64-unknown-linux-gnu` 并上传 AppImage。
- `build-windows` 依赖校验任务，构建 `x86_64-pc-windows-msvc`，并上传 NSIS 安装器以及包含 `portable.json` 和 `data/` 的便携 ZIP。
- `release` 只对 `v*` 标签运行，使用具备 `contents: write` 权限的 `GITHUB_TOKEN` 将两个平台的产物附加到 GitHub Release。

标签发布时，`v<version>` 必须与 `packages/gui/src-tauri/tauri.conf.json` 解析出的版本完全一致；该配置指向 `packages/gui/package.json`。`.github/scripts/release-meta.mjs` 会在校验和打包前强制检查这一点。产物名遵循以下形式：

```text
AlsoMusicPlayer-gui-v<version>-windows-x64-setup.exe
AlsoMusicPlayer-gui-v<version>-windows-x64-portable.zip
AlsoMusicPlayer-gui-v<version>-linux-x64-appimage.AppImage
```

拉取请求与手动触发的构建使用 `dev-<run_number>`，不使用标签版本。

## 致谢

感谢 [Sonorbit / Loop-Sound-Player](https://github.com/Violexjj/Loop-Sound-Player) 项目带来的灵感与参考。
