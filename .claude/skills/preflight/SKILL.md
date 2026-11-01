---
name: preflight
description: Pre-push checks for the Edukids Screenshot Tauri app — typecheck, web build, config/workflow validation, version sync, updater key and FFmpeg sidecar naming. Use before pushing to main, before tagging a release, or when asked to "check"/"preflight" the project.
---

# Preflight

Run every check below from the repo root and report a pass/fail table at the end. Do not modify files; if something fails, report it and suggest the fix.

`yarn` may not be installed globally on this machine — use `npx --yes yarn@1 <cmd>` when `yarn` is missing.

## Checks

1. **Version sync** — the version must be identical in all three files:
   - `package.json` → `"version"`
   - `src-tauri/tauri.conf.json` → `"version"`
   - `src-tauri/Cargo.toml` → `[package] version`
   ```bash
   node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8')).version;const t=JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json','utf8')).version;const c=fs.readFileSync('src-tauri/Cargo.toml','utf8').match(/^version\s*=\s*\"([^\"]+)\"/m)[1];console.log({package:p,tauri:t,cargo:c});process.exit(p===t&&t===c?0:1)"
   ```

2. **Updater public key** — `plugins.updater.pubkey` in `src-tauri/tauri.conf.json` must not contain `REPLACE_WITH`. A placeholder here means released builds can never verify updates (CI also blocks tag builds on this).

3. **JSON / YAML parse**
   - `src-tauri/tauri.conf.json`, `src-tauri/tauri.windows.conf.json`, `src-tauri/capabilities/default.json`, `package.json` via `JSON.parse`.
   - `.github/workflows/release.yml` via `npx --yes js-yaml .github/workflows/release.yml`.

4. **Capabilities** — `src-tauri/capabilities/default.json` must include `updater:default`, `process:allow-restart`, `dialog:allow-ask`, `dialog:allow-message`.

5. **FFmpeg sidecar naming** — `src-tauri/tauri.windows.conf.json` declares `externalBin: ["binaries/ffmpeg"]`. Tauri v2 needs `binaries/ffmpeg-x86_64-pc-windows-msvc.exe`. Confirm the Windows step in `.github/workflows/release.yml` copies to that exact name. Locally the file is optional (only needed for a local Windows `yarn build`).

6. **TypeScript** — `npx tsc --noEmit -p .`

7. **Web build** — `npx --yes yarn@1 build:web`

8. **Rust** — `cargo` lives in `%USERPROFILE%\.cargo\bin` (add it to PATH for the shell). Run `cargo check --manifest-path src-tauri/Cargo.toml`. If cargo is genuinely unavailable, mark as **SKIPPED** — never report it as passed.

9. **Windows smoke test (only when asked for a full preflight or before a release)** — `yarn build:local` then `yarn test:smoke`; must be 11/11. It launches the real app with WebView2 remote debugging and checks: no console window, IPC alive, 4 shortcuts registered, capture returns an image, region overlay opens without deadlock, Ctrl+Shift+2 shows the overlay, a 3 s recording produces a file, shortcut settings change/reset. It kills any running Edukids instance first — tell the user.

## Output

A short table: check → ✅ / ❌ / ⏭️ skipped, with a one-line reason for every non-pass, then the overall verdict ("safe to push" only if nothing failed).
