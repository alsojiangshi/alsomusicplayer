# AlsoMusicPlayer

[English](./README.md) | [简体中文](./README.zh-CN.md)

AlsoMusicPlayer is a personal music player developed mainly with AI assistance. The earlier version had too many missing or unfinished features, so the project is now being partially rebuilt, and CLI development is planned for a later stage. Overview:

- `Tauri v2 + React + TypeScript`
- local library indexing without copying audio files
- source-aware tracks: `local_file`, `direct_url`, `resolver`
- playlists, queue, synced lyrics, desktop lyrics window
- Windows SMTC support for media keys, media overlay, and lock-screen media cards
- GitHub CI packaging for Windows and Linux GUI releases

## Architecture

```text
packages/
  core/   shared domain types, track merge helpers, lyric parser, formatters
  gui/    React desktop UI + Tauri host + native SQLite library backend
```

Key design decisions in this rewrite:

- The GUI is the primary deliverable. CLI is intentionally out of the current release path.
- The Tauri host owns scanning, SQLite persistence, playlist CRUD, lyrics lookup, tray behavior, desktop lyrics window lifecycle, and session storage.
- The frontend owns presentation and the HTML5 audio playback engine, then syncs playback state back to the host session surface.
- Local artwork is promoted to a real `artworkRef` path by caching embedded art or nearby cover files into app data when available.
- Track edits are stored as override records in the app database instead of being written back into local audio tags.

## Source Model

Each track is normalized around these fields:

- `sourceKind`
- `sourceLocator`
- `resolverId`
- `availability`
- `fingerprint`
- `artworkRef`
- `lyricRef`

Merge precedence is:

```text
user overrides > scanned metadata > fallback values
```

## Windows SMTC

Windows builds expose playback to System Media Transport Controls through the app playback session:

- play / pause / previous / next are wired to system media controls
- playback state and timeline are synchronized from the player session
- current track metadata and artwork are pushed to the Windows media overlay when available
- minimizing to tray does not disable SMTC while the player keeps running

Linux builds keep the current desktop-player path and do not add MPRIS in this phase.

## Development

Requirements:

- Node.js 22+
- `pnpm`
- Rust stable
- Linux builds additionally need WebKitGTK system libraries

Install and run:

```bash
pnpm install
pnpm dev
```

Type checking and tests:

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

Tagged releases produce Windows `NSIS` installers plus Linux `AppImage` artifacts.

## Local Environment Notes

This repository now expects a newer Rust dependency ecosystem than the local `cargo 1.82.0` environment handled cleanly during validation. The TypeScript side was validated successfully in this workspace. Rust dependency resolution here may still be blocked by transitive crates that require newer Cargo manifest support, so CI should continue using current stable Rust.

## Acknowledgements

Thanks to the [Sonorbit](https://github.com/Violexjj/Loop-Sound-Player) project for providing part of the reference and inspiration.
