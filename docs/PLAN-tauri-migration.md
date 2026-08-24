# Plan: Migrate Tauri App to Root and Clean Up Unrelated Code

This plan outlines the steps to restructure the workspace by removing the Electron-related code and configurations, preserving workspace/Agent settings, and moving the Tauri application from `app-tauri/` to the root directory.

## Project Type
- **Desktop/Web App**: Tauri (Rust backend with React/Vite/TS frontend)

## Success Criteria
- The root directory contains only the Tauri application files and workspace/Agent settings.
- The Electron application directories and configuration files are completely removed.
- All workspace-specific files (`.git`, `.github`, `.agent`, `.cursor`, `.windsurfrules`, `AGENTS.md`, `CLAUDE.md`) are preserved.
- The Tauri project compiles and builds successfully at the root level.
- Dev server runs successfully at the root level.

## Tech Stack
- **Backend**: Rust (Tauri v1/v2)
- **Frontend**: Vite, React, TypeScript, HTML, CSS
- **Package Manager**: yarn / npm (defined by `app-tauri/package.json` and lockfiles)

## File Structure

### Files/Directories to Delete (Electron / Unrelated)
- `electron/`
- `dist-electron/`
- `build/`
- `dist/`
- `release/`
- `src/` (old Electron src)
- `public/` (old Electron public)
- `index.html` (old Electron entrypoint)
- `package.json` (old Electron packages)
- `yarn.lock` (old lockfile)
- `node_modules/` (old node modules)
- `vite.config.ts` (old Electron config)
- `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `eslint.config.js` (old TS/ESLint configs)
- `fix-git-history.sh`, `fix_rust.py` (legacy scripts if not needed)

### Files/Directories to Preserve (Workspace/Agent Settings)
- `.git/`
- `.github/`
- `.agent/`
- `.cursor/`
- `.superdesign/`
- `.windsurfrules`
- `AGENTS.md`
- `CLAUDE.md`

### Files/Directories to Move from `app-tauri/` to Root
- `app-tauri/src/` -> `src/`
- `app-tauri/src-tauri/` -> `src-tauri/`
- `app-tauri/public/` -> `public/`
- `app-tauri/index.html` -> `index.html`
- `app-tauri/package.json` -> `package.json`
- `app-tauri/tsconfig.json` -> `tsconfig.json`
- `app-tauri/vite.config.ts` -> `vite.config.ts`
- `app-tauri/yarn.lock` -> `yarn.lock` (or `package-lock.json`)
- `app-tauri/ffmpeg.zip` -> `ffmpeg.zip`
- `app-tauri/scripts/` -> `scripts/`
- `app-tauri/docs/` -> `docs/`
- `app-tauri/.omx/` -> `.omx/`

---

## Task Breakdown

### Phase 1: Preparation & Cleanup of app-tauri build artifacts

#### Task 1.1: Clean heavy folders from `app-tauri`
- **Agent**: `code-archaeologist`
- **Skills**: `clean-code`
- **Priority**: P0
- **Dependencies**: None
- **INPUT**: Existing `/Applications/work/screenshot-tool/app-tauri` directory.
- **OUTPUT**: Cleaned `/Applications/work/screenshot-tool/app-tauri` without `node_modules`, `dist`, or `.cargo-tmp`.
- **VERIFY**: Check that `/Applications/work/screenshot-tool/app-tauri/node_modules` and other build artifacts are deleted.

---

### Phase 2: Deletion of unrelated root-level files/directories

#### Task 2.1: Delete Electron code and root configuration files
- **Agent**: `code-archaeologist`
- **Skills**: `clean-code`
- **Priority**: P0
- **Dependencies**: None
- **INPUT**: Existing root directory with Electron-specific files.
- **OUTPUT**: Cleaned root directory with only workspace/Agent folders and `app-tauri` directory remaining.
- **VERIFY**: Confirm deletion of `electron/`, `dist-electron/`, `build/`, `dist/`, `release/`, root `src/`, root `public/`, and configurations (`package.json`, `tsconfig.json`, `vite.config.ts` at root). Confirm that `.agent/`, `.git/`, `.cursor/`, `AGENTS.md`, and `CLAUDE.md` are intact.

---

### Phase 3: Moving Tauri files to root level

#### Task 3.1: Move files from `app-tauri/` to root
- **Agent**: `code-archaeologist`
- **Skills**: `clean-code`
- **Priority**: P0
- **Dependencies**: Task 2.1
- **INPUT**: Files inside `/Applications/work/screenshot-tool/app-tauri/`.
- **OUTPUT**: All Tauri files located at the workspace root `/Applications/work/screenshot-tool/`.
- **VERIFY**: Check that `src-tauri/`, `src/`, `public/`, `package.json`, `vite.config.ts`, etc. exist at the root level.

#### Task 3.2: Delete empty `app-tauri` folder
- **Agent**: `code-archaeologist`
- **Skills**: `clean-code`
- **Priority**: P0
- **Dependencies**: Task 3.1
- **INPUT**: Empty `/Applications/work/screenshot-tool/app-tauri/` directory.
- **OUTPUT**: Directory `app-tauri/` is deleted.
- **VERIFY**: Check that `/Applications/work/screenshot-tool/app-tauri/` does not exist.

---

### Phase 4: Configuration Update & Build Validation

#### Task 4.1: Install dependencies at the root level
- **Agent**: `backend-specialist`
- **Skills**: `nodejs-best-practices`
- **Priority**: P0
- **Dependencies**: Task 3.2
- **INPUT**: Root level `package.json` and lockfile.
- **OUTPUT**: `node_modules` folder installed at root.
- **VERIFY**: Run package installer (`yarn install` or `npm install`) and verify successful completion.

#### Task 4.2: Verify Tauri compilation and build
- **Agent**: `backend-specialist`
- **Skills**: `nodejs-best-practices`, `rust-pro`
- **Priority**: P0
- **Dependencies**: Task 4.1
- **INPUT**: Root level codebase.
- **OUTPUT**: Successful project build.
- **VERIFY**: Run build checks (e.g. `yarn build` or Tauri dev server checks) and check if Tauri compiles Rust code successfully.

---

## Phase X: Verification

### Automated Checks
- [x] Run linter & typescript checks: `yarn build:web`
- [x] Run security check on workspace: `python .agent/skills/vulnerability-scanner/scripts/security_scan.py .`
- [x] Run build command: `yarn build:web` && `cargo check`

### Manual Verification
- [x] Verify that the app-tauri code is moved to the root level.
- [x] Verify that Agent config files `.agent/` and `.cursor/` are intact and working.

## ✅ PHASE X COMPLETE
- Lint: ✅ Pass (Vite production build succeeds)
- Security: ✅ No critical issues (in user project code)
- Build: ✅ Success (Vite built, Rust cargo checked successfully)
- Date: 2026-06-15

