// Windows smoke test for a built Edukids Screenshot executable.
//
// Launches the real app with WebView2 remote debugging enabled, then drives it
// through the Chrome DevTools Protocol (calls the same Tauri commands the UI
// uses) and checks the regressions we have actually shipped before:
//   - extra console window on launch
//   - IPC dead / main thread deadlocked after opening the region overlay
//   - screen capture failing
//   - global shortcuts not registered / not firing
//   - screen recording not producing a file
//   - shortcut settings not applying
//
// Usage:
//   node scripts/smoke-test-windows.mjs [path\to\screenshot-tool.exe]
// Default exe: src-tauri/target/release/screenshot-tool.exe
// Exit code 0 = all checks passed.

import { spawn, execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

if (process.platform !== 'win32') {
  console.error('smoke-test-windows only runs on Windows');
  process.exit(2);
}

const exe = path.resolve(process.argv[2] ?? 'src-tauri/target/release/screenshot-tool.exe');
if (!existsSync(exe)) {
  console.error(`Executable not found: ${exe}`);
  process.exit(2);
}

const PORT = 9399;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

function ps(command) {
  return execFileSync('powershell', ['-NoProfile', '-Command', command], { encoding: 'utf8' }).trim();
}

// Make sure no other instance holds the shortcuts / single-instance lock.
try { ps("Get-Process screenshot-tool -ErrorAction SilentlyContinue | Stop-Process -Force"); } catch {}
await sleep(1500);

const app = spawn(exe, [], {
  cwd: path.dirname(exe),
  env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: false,
});
let stderr = '';
app.stderr.on('data', (d) => { stderr += d; });
app.stdout.on('data', (d) => { stderr += d; });
let exited = null;
app.on('exit', (code) => { exited = code; });

// ── CDP helpers ───────────────────────────────────────────────────────────────
async function targets() {
  try { return await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); } catch { return []; }
}
async function waitFor(fn, timeoutMs, stepMs = 250) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(stepMs);
  }
  return null;
}
async function connect(urlPrefix) {
  const t = await waitFor(async () => (await targets()).find((x) => x.url.startsWith(urlPrefix)), 20000);
  if (!t) return null;
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  const evaluate = (expression, timeoutMs = 10000) => new Promise((resolve) => {
    const i = ++id;
    const timer = setTimeout(() => { pending.delete(i); resolve({ timeout: true }); }, timeoutMs);
    pending.set(i, (msg) => {
      clearTimeout(timer);
      const r = msg.result;
      if (r?.exceptionDetails) resolve({ error: r.exceptionDetails.exception?.description ?? r.exceptionDetails.text });
      else resolve({ value: r?.result?.value });
    });
    ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
  });
  return { ws, evaluate };
}
// Invoke a Tauri command with a timeout (a hung command = deadlock).
const invokeExpr = (cmd, args = {}, ms = 8000) => `(async () => {
  const p = window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)});
  return await Promise.race([
    p.then(v => ({ ok: true, v }), e => ({ ok: false, err: String(e) })),
    new Promise(r => setTimeout(() => r({ ok: false, err: 'TIMEOUT (hung)' }), ${ms})),
  ]);
})()`;

function pressKeys(vks) {
  // keybd_event: press in order, release in reverse.
  const down = vks.map((vk) => `[K]::keybd_event(${vk},0,0,[UIntPtr]::Zero)`).join(';');
  const up = [...vks].reverse().map((vk) => `[K]::keybd_event(${vk},0,2,[UIntPtr]::Zero)`).join(';');
  ps(`Add-Type 'using System;using System.Runtime.InteropServices;public class K{[DllImport("user32.dll")]public static extern void keybd_event(byte v,byte s,uint f,UIntPtr e);}'; ${down}; Start-Sleep -Milliseconds 80; ${up}`);
}
const VK = { CTRL: 0x11, SHIFT: 0x10, ALT: 0x12, ESC: 0x1b, D2: 0x32, D9: 0x39 };

let main;
try {
  // 1. Launch
  main = await connect('http://tauri.localhost/');
  record('app launches and main webview loads', !!main && exited === null, exited !== null ? `exited with ${exited}: ${stderr.slice(0, 300)}` : '');
  if (!main) throw new Error('no main webview');
  await sleep(1500);

  // 2. No console window (PseudoConsoleWindow / conhost child)
  const conhost = ps(`(Get-CimInstance Win32_Process -Filter "ParentProcessId=${app.pid}" | Where-Object Name -eq 'conhost.exe' | Measure-Object).Count`);
  record('no console window attached', conhost === '0', `conhost children: ${conhost}`);

  const alive = async () => (await main.evaluate(invokeExpr('plugin:app|version', {}, 3000))).value?.ok === true;

  // 3. IPC
  const ver = await main.evaluate(invokeExpr('plugin:app|version'));
  record('IPC responds', ver.value?.ok, ver.value?.v ?? ver.value?.err ?? ver.error);

  // 4. Shortcuts registered
  const labels = await main.evaluate(invokeExpr('get_shortcut_labels'));
  const n = Object.keys(labels.value?.v ?? {}).length;
  record('4 global shortcuts registered', n === 4, JSON.stringify(labels.value?.v ?? labels.value?.err));

  // 5. Screen capture
  const cap = await main.evaluate(`(async () => {
    try { const d = await window.__TAURI_INTERNALS__.invoke('get_screen_capture'); return { ok: d.startsWith('data:image/'), len: d.length }; }
    catch (e) { return { ok: false, err: String(e) }; } })()`, 15000);
  record('get_screen_capture returns an image', cap.value?.ok, cap.value?.err ?? `len=${cap.value?.len}`);

  // 6. Region overlay opens without deadlocking the app
  const open = await main.evaluate(`(async () => {
    const inv = window.__TAURI_INTERNALS__.invoke;
    const dataUrl = await inv('get_screen_capture');
    return await Promise.race([
      inv('start_region_capture', { dataUrl }).then(() => ({ ok: true }), e => ({ ok: false, err: String(e) })),
      new Promise(r => setTimeout(() => r({ ok: false, err: 'TIMEOUT (deadlock)' }), 8000)),
    ]); })()`, 20000);
  const overlay = await waitFor(async () => (await targets()).find((t) => t.url.includes('#overlay')), 8000);
  const aliveAfterOverlay = await alive();
  record('region overlay opens (no deadlock)', open.value?.ok && !!overlay && aliveAfterOverlay,
    `${open.value?.err ?? 'ok'}; overlay page: ${overlay ? 'loaded' : 'missing'}; app alive: ${aliveAfterOverlay}`);

  // 7. Close overlay again, app still alive
  const close = await main.evaluate(invokeExpr('close_overlay', {}));
  record('overlay closes, app still responsive', close.value?.ok && (await alive()), close.value?.err ?? '');

  // 8. Global hotkey actually fires: Ctrl+Shift+2 must show the overlay window
  //    (it exists hidden after step 6/7) and the app must stay responsive.
  const overlayShown = async () => (await main.evaluate(`(async () => {
    try {
      const w = await window.__TAURI_INTERNALS__.invoke('plugin:window|is_visible', { label: 'overlay' });
      return w;
    } catch (e) { return 'ERR ' + e; } })()`, 4000)).value;
  const before = await overlayShown();
  pressKeys([VK.CTRL, VK.SHIFT, VK.D2]);
  const shownAfter = await waitFor(async () => (await overlayShown()) === true, 8000);
  const aliveAfterHotkey = await alive();
  record('Ctrl+Shift+2 opens the overlay, app responsive', !!shownAfter && aliveAfterHotkey,
    `overlay visible before=${before} after=${!!shownAfter}; alive=${aliveAfterHotkey}`);
  pressKeys([VK.ESC]);
  await sleep(800);
  await main.evaluate(invokeExpr('close_overlay', {}));

  // 9. Full-screen recording produces a file
  const ff = await main.evaluate(invokeExpr('check_ffmpeg_installed'));
  if (ff.value?.v !== true) {
    record('ffmpeg available', false, 'check_ffmpeg_installed returned false');
  } else {
    const start = await main.evaluate(invokeExpr('start_recording_full', { screenIndex: 'desktop' }, 15000), 20000);
    await sleep(3000);
    const stop = await main.evaluate(invokeExpr('stop_recording', {}, 15000), 20000);
    const file = stop.value?.v;
    const size = file && existsSync(file) ? statSync(file).size : 0;
    record('full-screen recording creates a video', start.value?.ok && stop.value?.ok && size > 0,
      start.value?.err ?? stop.value?.err ?? `${file} (${size} bytes)`);

    // 9b/9c. Video editing: export trimmed+sped-up+muted MP4 and a GIF.
    if (size > 0) {
      const ffprobe = [path.join(path.dirname(exe), 'ffmpeg.exe'), path.join(process.env.LOCALAPPDATA ?? '', 'Edukids Screenshot', 'ffmpeg.exe')]
        .find((p) => existsSync(p));
      const probe = (f) => {
        try { execFileSync(ffprobe, ['-hide_banner', '-i', f], { stdio: 'pipe' }); } catch (e) { return String(e.stderr ?? ''); }
        return '';
      };
      const durationOf = (info) => {
        const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(info);
        return m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : NaN;
      };
      const tmp = process.env.TEMP ?? path.dirname(file);
      const mp4 = path.join(tmp, `edukids-smoke-export-${Date.now()}.mp4`);
      const gif = path.join(tmp, `edukids-smoke-export-${Date.now()}.gif`);

      const ex1 = await main.evaluate(invokeExpr('export_recording', {
        sourcePath: file, destPath: mp4, options: { start: 0.5, end: 2.5, speed: 2, mute: true, format: 'mp4' },
      }, 30000), 40000);
      const info1 = existsSync(mp4) ? probe(mp4) : '';
      const d1 = durationOf(info1);
      record('export MP4 (trim 0.5–2.5s, 2x, muted) ≈ 1s, no audio',
        ex1.value?.ok && Math.abs(d1 - 1) < 0.3 && !/Audio:/.test(info1),
        ex1.value?.err ?? `duration=${d1.toFixed?.(2)}s audio=${/Audio:/.test(info1)}`);

      const ex2 = await main.evaluate(invokeExpr('export_recording', {
        sourcePath: file, destPath: gif, options: { start: 0, end: 2, speed: 1, mute: false, format: 'gif' },
      }, 60000), 70000);
      const gifOk = existsSync(gif) && statSync(gif).size > 0 && /Video: gif/.test(probe(gif));
      record('export GIF', ex2.value?.ok && gifOk, ex2.value?.err ?? `${existsSync(gif) ? statSync(gif).size : 0} bytes`);

      for (const f of [mp4, gif]) { try { (await import('node:fs')).unlinkSync(f); } catch {} }
    }
    if (file) await main.evaluate(invokeExpr('discard_recording', { sourcePath: file }));
  }

  // 10. Shortcut settings: change, verify label, reset
  const set = await main.evaluate(invokeExpr('set_shortcut', { event: 'trigger-capture-full', accelerator: 'Ctrl+Alt+Shift+Digit9' }));
  const after = await main.evaluate(invokeExpr('get_shortcut_labels'));
  const changed = after.value?.v?.['trigger-capture-full'] === 'Ctrl+Alt+Shift+9';
  const reset = await main.evaluate(invokeExpr('set_shortcut', { event: 'trigger-capture-full', accelerator: null }));
  const back = await main.evaluate(invokeExpr('get_shortcut_labels'));
  record('shortcut settings change + reset', set.value?.ok && changed && reset.value?.ok && back.value?.v?.['trigger-capture-full'] === 'Ctrl+Shift+3',
    `${set.value?.err ?? ''} after=${after.value?.v?.['trigger-capture-full']} back=${back.value?.v?.['trigger-capture-full']}`);

  // 11. Still alive at the end
  record('app still responsive at the end', await alive());
} catch (e) {
  record('smoke test crashed', false, String(e));
} finally {
  try { main?.ws.close(); } catch {}
  try { ps(`Stop-Process -Id ${app.pid} -Force -ErrorAction SilentlyContinue`); } catch {}
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (stderr.trim()) console.log('\n--- app stderr ---\n' + stderr.trim().slice(0, 2000));
process.exit(failed.length ? 1 : 0);
