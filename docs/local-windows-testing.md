# Local Windows Artifact Testing

This project can be tested locally on Windows without waiting for GitHub Actions, but the local Rust toolchain must be new enough for current dependencies.

## Requirements

- Node.js 22+
- `pnpm`
- Rust stable with a `cargo` version newer than `1.82.0`

Recommended setup commands:

```bash
rustup update stable
rustup default stable
cargo -V
rustc -V
```

The acceptance bar is not "the latest version number". The important part is that local `cargo` supports dependencies that require `edition2024`.

## Daily Development Loop

Use desktop dev mode first. Do not package on every change.

```bash
pnpm install
pnpm dev
```

Use this loop to validate:

- UI behavior
- playback flow
- Tauri commands
- Windows SMTC
- tray behavior
- desktop lyrics
- remove-current-track state consistency

## Release-State Validation

Fast local release build without installers:

```bash
pnpm build:tauri:local
```

This skips NSIS bundling and produces the release executable quickly in `packages/gui/src-tauri/target/release/`.

Create a local portable zip with the same file layout used by CI:

```bash
pnpm package:portable:local
```

This portable package is now a true portable layout:

- the zip includes a `portable.json` marker next to the executable
- user data is written to `.\data\` beside the executable after launch
- the plain `target/release/` executable from `pnpm build:tauri:local` is not portable by itself unless that marker file is present

Full packaging with installer generation:

```bash
pnpm build:tauri
```

Use `pnpm build:tauri` when you specifically need to validate the installer path and the machine can download the NSIS bundler resources. The first installer build may need to download NSIS support files.

## Artifact Locations

Installer output:

- `packages/gui/src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/*.exe`

Release runtime directory:

- `packages/gui/src-tauri/target/x86_64-pc-windows-msvc/release/`

For portable-equivalent validation, run the executable directly from the `release` directory first instead of copying out only one `.exe`. That directory includes the runtime files the app may need next to the executable.

## Portable Packaging Rule

If you manually simulate the portable zip, keep the same layout used by CI. Do not blindly assume that only `also-music-player.exe` is always enough; package every runtime sidecar that exists next to the release executable.

Include when present:

- `also-music-player.exe`
- `*.dll`
- `*.pak`
- `*.dat`
- `*.bin`
- `*.json`
- `locales/`
- `resources/`

Portable-specific files:

- `portable.json`
- `data/` will be created beside the executable on first launch if it is not already present

## Recommended Validation Order

1. `pnpm dev` opens the main window successfully.
2. `pnpm build:tauri:local` completes successfully.
3. The executable inside the `release` directory launches directly.
4. `pnpm package:portable:local` produces a portable zip that launches after extraction.
5. `pnpm build:tauri` completes successfully when you need installer validation.

Only after these five checks pass should GitHub Actions be used as the final Windows/Linux release verification layer.
