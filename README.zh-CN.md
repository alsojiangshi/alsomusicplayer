# AlsoMusicPlayer

[English](./README.md) | [简体中文](./README.zh-CN.md)

AlsoMusicPlayer 是主要由AI开发的自用音乐播放器。由于原先版本功能缺漏过大，现了进行部分重构，且计划将CLI版本的开发放到后面再做。以下是说明：

- `Tauri v2 + React + TypeScript`
- 本地音乐索引，不复制音频文件
- 面向来源的曲目模型：`local_file`、`direct_url`、`resolver`
- 歌单、播放队列、同步歌词、桌面歌词窗口
- Windows SMTC 支持，接入系统媒体键、系统媒体浮层和锁屏媒体卡片
- GitHub CI 面向 Windows 和 Linux GUI 版本自动打包

## 架构

```text
packages/
  core/   共享领域类型、曲目合并逻辑、歌词解析器、格式化工具
  gui/    React 桌面界面 + Tauri 宿主层 + 原生 SQLite 媒体库后端
```

这次重构的关键设计决策：

- GUI 是当前唯一主交付物，CLI 暂时不在发布链路内。
- Tauri 宿主层负责扫描、SQLite 持久化、歌单 CRUD、歌词检索、托盘行为、桌面歌词窗口生命周期以及会话存储。
- 前端负责界面和 HTML5 Audio 播放引擎，并把播放状态同步回宿主层会话面。
- 本地封面会在可用时从内嵌图片或邻近封面文件缓存到应用数据目录，并升级为真实可用的 `artworkRef`。
- 曲目信息编辑只写入应用数据库覆盖层，不回写本地音频标签。

## 来源模型

每首曲目都会归一化到这些核心字段：

- `sourceKind`
- `sourceLocator`
- `resolverId`
- `availability`
- `fingerprint`
- `artworkRef`
- `lyricRef`

合并优先级固定为：

```text
用户覆盖 > 扫描元数据 > 回退值
```

## Windows SMTC

Windows 版本会通过播放器会话把播放状态暴露给 System Media Transport Controls：

- `播放 / 暂停 / 上一首 / 下一首` 会接入系统媒体控制
- 播放状态和时间轴会和播放器会话同步
- 当前曲目的标题、艺术家、专辑和封面会在可用时推送到 Windows 媒体浮层
- 窗口最小化到托盘后，只要播放器仍在运行，SMTC 仍然保持可用

Linux 版本本阶段继续沿用当前桌面播放器路径，不在这次重构里新增 MPRIS。

## 本地开发

环境要求：

- Node.js 22+
- `pnpm`
- Rust stable
- Linux 构建额外需要 WebKitGTK 系统库

安装并启动：

```bash
pnpm install
pnpm dev
```

类型检查和测试：

```bash
pnpm typecheck
pnpm test:core
cargo test --manifest-path packages/gui/src-tauri/Cargo.toml
```

## CI 发布

当前 GitHub Actions 只围绕 GUI 交付，覆盖：

- TypeScript 类型检查
- 共享核心测试
- Rust 测试
- Windows 打包
- Linux 打包

标签发布会输出 Windows `NSIS` 安装包和 Linux `AppImage` 产物。

## 当前环境说明

这个仓库现在依赖比本机 `cargo 1.82.0` 更新的 Rust 依赖生态。当前工作区里，TypeScript 侧已经完成验证；Rust 侧的依赖解析仍可能被较新的 Cargo manifest 特性卡住，所以 CI 应继续使用当前 stable Rust 作为准绳。

## 致谢

感谢 [Sonorbit](https://github.com/Violexjj/Loop-Sound-Player) 项目为我提供了部分参考