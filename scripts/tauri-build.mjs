import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const tauriCli = require.resolve("@tauri-apps/cli/tauri.js");
const env = { ...process.env };

// Finder can briefly retain Tauri's temporary DMG on macOS and make the
// bundler's final detach fail. CI mode skips that Finder-only cosmetic pass.
if (process.platform === "darwin") {
  env.CI = "true";
}

const child = spawn(
  process.execPath,
  [tauriCli, "build", ...process.argv.slice(2)],
  { env, stdio: "inherit" },
);

child.on("error", (error) => {
  console.error(`Failed to start Tauri CLI: ${error.message}`);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exitCode = code ?? 1;
});
