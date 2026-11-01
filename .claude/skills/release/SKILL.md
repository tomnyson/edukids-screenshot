---
name: release
description: Cut a new Edukids Screenshot release — bump the version in all three files, run preflight, commit, tag vX.Y.Z and push so GitHub Actions builds Windows + macOS and publishes the auto-update feed. Use when the user runs /release or asks to publish/release a new version.
argument-hint: "<version, e.g. 1.1.1>"
disable-model-invocation: true
---

# Release

Target version: `$ARGUMENTS` (semver `X.Y.Z`, no leading `v`). If missing or invalid, ask for it. It must be greater than the current version in `src-tauri/tauri.conf.json` — the in-app updater only offers strictly newer versions.

`yarn` may not be installed globally — use `npx --yes yarn@1 <cmd>` when needed.

## Steps

1. **Pre-checks** (stop and report on any failure):
   - Working tree is clean (`git status --porcelain` empty) and the branch is `main`.
   - Tag `v<version>` does not already exist locally or on `origin` (`git ls-remote --tags origin v<version>`).
   - `plugins.updater.pubkey` in `src-tauri/tauri.conf.json` does not contain `REPLACE_WITH`.

2. **Bump the version** in exactly these three places (nothing else):
   - `package.json` → `"version"`
   - `src-tauri/tauri.conf.json` → `"version"`
   - `src-tauri/Cargo.toml` → `[package] version` (only the first `version =` line under `[package]`, not dependency versions)
   - If `cargo` is available, run `cargo update -p screenshot-tool --manifest-path src-tauri/Cargo.toml` so `Cargo.lock` matches.

3. **Run the `preflight` skill checks.** Do not continue if any check fails.

3b. **Build locally and run the smoke test — mandatory, never skip.** Every bad release so far (console window, capture failing, overlay deadlock) passed CI and only showed up on a real machine.
   - Ensure `src-tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe` exists (copy an `ffmpeg.exe` there if missing; the folder is gitignored).
   - `yarn build:local` (= `tauri build --no-bundle`; needs Rust + VS C++ Build Tools, `%USERPROFILE%\.cargo\bin` on PATH).
   - `yarn test:smoke` → must print **11/11 checks passed**. Any FAIL = stop, fix, rebuild, retest.
   - Report the smoke-test table to the user before asking for confirmation.
   - On macOS there is no automated smoke test yet: say so explicitly instead of implying it was tested.

4. **Show the user a summary and ask for confirmation** before any git write:
   - old → new version, the diff (`git diff --stat`), and the exact commands below.

5. **After confirmation**, run:
   ```bash
   git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
   git commit -m "release: v<version>"
   git tag v<version>
   git push origin main
   git push origin v<version>
   ```
   Commit message must end with the attribution lines required by the current session, if any.

6. **Report** what was pushed and what happens next:
   - GitHub Actions workflow `.github/workflows/release.yml` builds Windows x64, macOS arm64, macOS x64, uploads to a draft release, and publishes it only when all three succeed.
   - Remind the user to verify the published `latest.json` contains `windows-x86_64`, `darwin-aarch64`, `darwin-x86_64` with non-empty signatures and URLs under `/download/v<version>/`.
   - Installed apps (≥ 1.1.0) will see the update prompt on next launch or via tray → "Kiểm tra cập nhật".

## Never

- Never force-push, delete, or move an existing tag.
- Never skip hooks or edit the signing secrets.
- Never tag if preflight failed or the user didn't confirm.
