# PLAN-tauri-dev-visibility

## Context
The Tauri backend has been set up with the main window configured as `visible: false` in `tauri.conf.json`. Furthermore, `lib.rs` sets the activation policy to `Accessory`, meaning the application runs solely in the background as a Tray Icon in the macOS Menu Bar. This completely hides the app from the Dock and screen upon launching `yarn dev`, which leads to the impression that "run dev not show any thing."

## Problem Statement
While the app successfully compiles and runs in dev mode, the developer experience is currently confusing because the main UI window isn't automatically displayed. The developer has to manually click the system tray icon to open the window each time the dev server restarts.

## Socratic Gate (User Clarification Needed)
Before proceeding with any code implementation to fix this behavior, please clarify:

1. **Automatic Dev Mode Visibility:** Should the main window automatically show up **only** when running the app in development mode (`yarn dev`), while keeping it hidden on startup for the production build?
2. **Dock Icon Behavior:** Do you want to continue running the app strictly as an Accessory (Tray-only, no Dock icon), or would you prefer it to behave like a standard application with an icon in the macOS Dock?
3. **Primary Entry Point:** Should the overarching design of the app remain Tray-first, hiding automatically upon closing the window, or a traditional windowed app?

## Proposed Task Breakdown

### Option A: Make Window Visible Only in Dev Mode
- [ ] In `tauri.conf.json`, keep `"visible": false`.
- [ ] In `lib.rs` setup, conditionally check if the app is in debug mode (e.g. `#[cfg(debug_assertions)]`).
- [ ] If in debug mode, retrieve the `main` window and force it to display (`win.show()`) and focus (`win.set_focus()`).

### Option B: Make Window Visible Everywhere on Startup
- [ ] In `tauri.conf.json`, change `"visible": false` to `"visible": true`.
- [ ] (Optional) In `lib.rs`, change the ActivationPolicy from `Accessory` to `Regular` so the user can easily switch to the app via the Dock.

### Option C: Keep As-is
- [ ] No code changes needed. Just remember to interact with the Tray Icon (top right of the macOS screen) to open the window after running `yarn dev`.

## Agent Assignment
- `orchestrator`: For coordinating changes across Rust backend config and frontend React code based on user feedback.
- `project-planner`: Created this plan document.

## Review
Please review this plan and answer the Socratic questions before we proceed. Use the `/create` command pointing to your preferred option to begin execution.
