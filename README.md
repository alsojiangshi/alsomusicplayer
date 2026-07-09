# AlsoMusicPlayer

[English](./README.md) | [简体中文](./README.zh-CN.md)

AlsoMusicPlayer is a desktop-first music player rebuilt around a local library workflow. The current deliverable is GUI-only and focuses on source-aware tracks, playlists, queue management, synced lyrics, desktop lyrics, Windows SMTC, and automated Windows/Linux packaging.

## Overview

- `Tauri v2 + React + TypeScript`
- source-aware tracks: `local_file`, `direct_url`, `resolver`
- local library indexing without copying audio files into app storage
- playlists, playback queue, synced lyrics, desktop lyrics window
- Windows SMTC integration for media keys and system media overlay
- GitHub Actions packaging for Windows and Linux GUI builds

## Architecture

```text
packages/
  core/   shared domain types, playback/session helpers, lyric parser, formatters
  gui/    React desktop UI + Tauri host + native SQLite backend
```

Key design decisions:

- The GUI desktop app is the current product target. CLI is intentionally out of scope for this release path.
- The Tauri host owns scanning, SQLite persistence, tray behavior, desktop lyrics lifecycle, session storage, and source resolution.
- The frontend owns presentation plus the HTML5 audio engine, then synchronizes playback state back to the host.
- Manual metadata edits are stored as override records in the app database instead of being written back into local audio tags.

## Language And Assets

The GUI now supports:

- `English`
- `简体中文`
- `Follow system` as the default language strategy

UI language is persisted in the existing `sessions` storage surface under the `ui_settings` key.

App and tray art asset paths:

- `packages/gui/src-tauri/icons/icon.png`
  - required
  - transparent PNG
  - recommended size: `1024x1024`
- `packages/gui/src-tauri/icons/icon.ico`
  - required for Windows packaging
  - multi-size ICO
  - should include at least `16/24/32/48/64/128/256`
- `packages/gui/src-tauri/icons/tray-icon.ico`
  - optional tray-specific Windows icon
  - recommended multi-size ICO with clear `16/20/24/32`
- `packages/gui/src-tauri/icons/tray-icon.png`
  - optional tray-specific Linux icon
  - recommended transparent PNG, `32x32` or `64x64`

If tray-specific assets are missing, the app currently falls back to the main application icon.

## Development

Requirements:

- Node.js 22+
- `pnpm`
- Rust stable used in CI
- Linux builds additionally require WebKitGTK system libraries

Install and run:

```bash
pnpm install
pnpm dev
```

Checks:

```bash
pnpm typecheck
pnpm test:core
cargo test --manifest-path packages/gui/src-tauri/Cargo.toml
```

## CI Releases

GitHub Actions is GUI-only and currently covers:

- TypeScript type checking
- shared core tests
- Rust tests
- Windows packaging
- Linux packaging

Tagged releases produce product-style artifacts such as:

- `AlsoMusicPlayer-gui-v1.4.8-windows-x64-setup.exe`
- `AlsoMusicPlayer-gui-v1.4.8-windows-x64-portable.zip`
- `AlsoMusicPlayer-gui-v1.4.8-linux-x64-appimage.AppImage`

Non-tag builds use a `dev-<run_number>` suffix.

## Local Environment Notes

This workspace currently validates TypeScript successfully. Local Rust validation may still be blocked on machines using an older Cargo toolchain, because newer transitive crates now expect newer Cargo manifest support than `cargo 1.82.0` provides. CI should remain the source of truth for Rust-side validation if your local toolchain is older.

## Acknowledgements

Thanks to the [Sonorbit](https://github.com/Violexjj/Loop-Sound-Player) project for part of the inspiration and reference direction.
