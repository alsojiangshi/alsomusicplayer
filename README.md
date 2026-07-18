# AlsoMusicPlayer

[English](./README.md) | [简体中文](./README.zh-CN.md)

## Overview

AlsoMusicPlayer is a desktop music player centered on an indexed, local-first music library. Its supported delivery path is a Tauri v2 GUI for Windows and Linux: React, TypeScript, Vite, and Zustand provide the interface and playback state, while the Rust host handles native windows, filesystem access, metadata scanning, SQLite persistence, and network-backed source resolution.

Local audio stays in its original location instead of being copied into application storage. The software code is distributed under the [MIT License](./LICENSE), subject to the exclusions described below.

## Features

- **Local library indexing:** import individual files or recursively scan folders through the file picker or drag and drop. The scanner recognizes MP3, FLAC, WAV, OGG/OGA, M4A/MP4, AAC, Opus, WMA, and AIFF/AIF; actual playback codec support depends on the platform WebView.
- **Metadata and artwork:** read duration, tags, bitrate, sample rate, channels, embedded artwork, same-name artwork, and common folder-cover files. Embedded artwork is extracted into the application cache.
- **Multiple source types:** play indexed local files and direct audio URLs, or search NetEase Cloud Music and store resolver-backed tracks. Remote playback depends on the network and the upstream source remaining available.
- **Library maintenance:** remember imported folders for later refreshes, mark missing local files, reveal local tracks in the system file manager, search the catalog, and remove library entries without deleting the source audio.
- **Non-destructive edits:** override title, artist, album, composer, duration, artwork reference, and lyrics in SQLite without rewriting the original audio tags.
- **Playlists and queue:** create, rename, and delete playlists; add or remove tracks; restore the playback queue and position; and use sequential, shuffle, repeat-one, or repeat-all playback.
- **Lyrics:** load manually entered lyrics, same-name local `.lrc` files, or LRCLIB search results; cache online results; show synchronized lyrics in the main window; and provide an always-on-top desktop lyrics window on Windows and Linux.
- **Desktop integration:** close the main window to the system tray, control playback from the tray menu, and expose metadata plus play/pause/previous/next handlers through the Web Media Session API when the system WebView supports it.
- **Localization and storage:** use English, Simplified Chinese, or follow the system language. Installed builds store SQLite data and caches in the Tauri application-data directory; the Windows portable package uses `portable.json` and keeps them beside the executable in `data/`.

## Architecture

```text
@music-player/core
  domain types, playback/session normalization, UI language helpers,
  formatters, and LRC parsing
                         │
                         ▼
React + Zustand frontend ── Tauri invoke/events ── Rust host
  UI and HTMLAudioElement                         ├─ filesystem + lofty metadata
  queue and playback state                       ├─ bundled SQLite via rusqlite
  synchronized lyric rendering                   ├─ HTTP source/lyrics resolution
  Web Media Session integration                  └─ tray + desktop lyric windows
```

- The GUI resolves `@core` to `packages/core/src/browser.ts`, which deliberately exposes the browser-safe shared model and pure helpers used by the desktop frontend.
- `packages/gui/src/app/App.tsx` is the active React entry. Zustand owns interface and playback snapshots, and `PlaybackService` drives an `HTMLAudioElement`, the queue, session synchronization, and Media Session metadata.
- The Tauri host in `packages/gui/src-tauri/src/` exposes commands and events for scanning, playlists, overrides, lyrics, sessions, source resolution, tray actions, and desktop lyrics.
- The Rust-owned SQLite database stores library roots, scanned track data, user overrides, playlists, lyric cache, and session values. A portable marker changes the data root; it does not change the database model.

## Repository Tree and Notes

```text
.
├─ .github/
│  ├─ scripts/release-meta.mjs       # version checks and artifact naming
│  └─ workflows/build.yml            # validation, Windows/Linux builds, releases
├─ docs/                              # local Windows artifact-testing guides
├─ packages/
│  ├─ core/
│  │  ├─ src/browser.ts              # active browser-safe export surface
│  │  ├─ src/{types,track,ui}.ts      # shared domain and normalization logic
│  │  ├─ src/lyrics/parser.ts         # LRC parser used by the GUI
│  │  ├─ src/{database,importers,...} # retained Node-oriented implementation
│  │  └─ test/track.test.ts           # active Node test suite
│  ├─ gui/
│  │  ├─ src/app/                     # active React UI, store, bridge, playback
│  │  ├─ src/styles/                  # desktop and lyrics-window styles
│  │  ├─ src-tauri/src/               # Rust host and SQLite implementation
│  │  ├─ src-tauri/{icons,capabilities}/
│  │  └─ vite.config.ts               # Vite build and @core alias
│  └─ cli/                            # retained Ink/Bun TUI source; not shipped
├─ scripts/package-windows-portable.ps1
│                                      # local portable ZIP packaging
├─ tests/                              # legacy Python tests; not in active CI
├─ Makefile                            # legacy Python-era commands
├─ requirements.txt                    # legacy Python dependency list
├─ package.json                        # active root development/check/build scripts
├─ pnpm-workspace.yaml                 # includes only packages/core and packages/gui
└─ tsconfig.base.json                  # shared TypeScript compiler settings
```

The supported workspace, root scripts, and CI pipeline build `packages/core` and `packages/gui`. `packages/cli`, the root Python tests, `Makefile`, and `requirements.txt` are retained source/history and are not supported product entry points.

## Development Requirements

- Node.js 22 (the CI baseline).
- pnpm 9.15.0, declared by the root `packageManager` field. `corepack enable` can provide the pinned pnpm version.
- A current Rust stable toolchain and Cargo with support for dependencies that use Rust 2024 edition metadata.
- Platform prerequisites from the [Tauri v2 prerequisite guide](https://v2.tauri.app/start/prerequisites/):
  - Windows: the MSVC Rust target, Microsoft C++ Build Tools with **Desktop development with C++**, and Microsoft Edge WebView2.
  - Linux: a C/C++ build toolchain plus WebKitGTK 4.1 and related development libraries. The Ubuntu 22.04 CI installs `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `libsoup-3.0-dev`, `libjavascriptcoregtk-4.1-dev`, and `patchelf`.

Install dependencies and start the complete desktop application:

```bash
pnpm install
pnpm --dir packages/gui tauri:dev
```

`pnpm dev` at the repository root starts only the Vite development server used by Tauri; host-backed library, database, tray, and filesystem features require `tauri:dev`.

Run all checks or individual checks:

```bash
pnpm test

pnpm typecheck
pnpm test:core
pnpm test:rust
```

Build the frontend or a packaged desktop application:

```bash
pnpm build
pnpm build:tauri
```

Windows also provides `pnpm build:tauri:local` for a release executable without an installer and `pnpm package:portable:local` for a local portable ZIP. See [Local Windows Artifact Testing](./docs/local-windows-testing.md).

## CI Requirements

The `Desktop Build` workflow runs for pull requests, `v*` tag pushes, and manual dispatches. Ordinary non-tag branch pushes do not trigger it.

- `validate` runs on Ubuntu 22.04 with Node.js 22 and Rust stable. It validates release metadata, installs the Linux Tauri libraries, runs `pnpm install --frozen-lockfile=false`, TypeScript type checking, core Node tests, and Rust tests.
- `build-linux` depends on validation, builds `x86_64-unknown-linux-gnu`, and uploads an AppImage.
- `build-windows` depends on validation, builds `x86_64-pc-windows-msvc`, and uploads an NSIS installer plus a portable ZIP containing `portable.json` and `data/`.
- `release` runs only for `v*` tags and attaches both platform artifacts to the GitHub release using `GITHUB_TOKEN` with `contents: write` permission.

For a tagged release, `v<version>` must exactly match the version resolved by `packages/gui/src-tauri/tauri.conf.json`, which points to `packages/gui/package.json`. `.github/scripts/release-meta.mjs` enforces this before validation and packaging. Artifact names follow these forms:

```text
AlsoMusicPlayer-gui-v<version>-windows-x64-setup.exe
AlsoMusicPlayer-gui-v<version>-windows-x64-portable.zip
AlsoMusicPlayer-gui-v<version>-linux-x64-appimage.AppImage
```

Pull-request and manually dispatched builds use `dev-<run_number>` instead of a tag version.

## License and Artwork Notice

The software source code, build scripts, configuration, tests, and compiled code are licensed under the MIT License. Project documentation and other non-code materials are not covered unless separately stated. The Nadeko Sengoku application icon and every generated or embedded variant under `packages/gui/src-tauri/icons/` are expressly excluded from MIT licensing. The character, underlying Monogatari work, source artwork, names, and related rights belong to their respective rightsholders; this project is not affiliated with or endorsed by them. The project does not grant permission to reuse or redistribute those icon assets. Third-party dependencies and user-imported or online content remain subject to their own rights and license terms. See [LICENSE](./LICENSE) for the controlling scope and full notice.

## Acknowledgements

Thanks to the [Sonorbit / Loop-Sound-Player](https://github.com/Violexjj/Loop-Sound-Player) project for inspiration and reference.
