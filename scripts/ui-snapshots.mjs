// Capture the app's own webview (not the desktop) in its main states, for design reviews.
// Usage: node scripts/ui-snapshots.mjs <outDir> [path\to\screenshot-tool.exe] [width] [height]
// States: idle, editor (with a synthetic image), shortcut settings, about, recording preview.
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const outDir = path.resolve(process.argv[2] ?? '.taste-skill/app-shots');
const exe = path.resolve(process.argv[3] ?? 'src-tauri/target/release/screenshot-tool.exe');
const W = +(process.argv[4] ?? 1200), H = +(process.argv[5] ?? 800);
const PORT = 9398;
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ps = (c) => execFileSync('powershell', ['-NoProfile', '-Command', c], { encoding: 'utf8' });
try { ps('Get-Process screenshot-tool -ErrorAction SilentlyContinue | Stop-Process -Force'); } catch {}
await sleep(1200);

const app = spawn(exe, [], { cwd: path.dirname(exe), env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` }, stdio: 'ignore' });

let t;
for (let i = 0; i < 80; i++) {
  try { t = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.url.startsWith('http://tauri.localhost/') && !x.url.includes('#overlay')); if (t) break; } catch {}
  await sleep(250);
}
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
const emit = (event, payload = null) => ev(`window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: ${JSON.stringify(event)}, payload: ${JSON.stringify(payload)} })`);
const shot = async (name) => {
  await sleep(700);
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(r.result.data, 'base64'));
  console.log('saved', name);
};

await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await sleep(1500);
// SNAP_LANG=en captures every state in English (to check text fits); restored to vi at the end.
const LANG = process.env.SNAP_LANG || 'vi';
await ev(`window.__TAURI_INTERNALS__.invoke('set_language', { lang: '${LANG}' })`);
await sleep(800);
await shot('1-idle');

// Synthetic "screenshot" (a fake web page) — never the real desktop.
const synth = await ev(`(() => {
  const c = document.createElement('canvas'); c.width = 1280; c.height = 760; const g = c.getContext('2d');
  g.fillStyle = '#f4f6fb'; g.fillRect(0, 0, 1280, 760);
  g.fillStyle = '#1e3a8a'; g.fillRect(0, 0, 1280, 64);
  g.fillStyle = '#fff'; g.font = 'bold 26px sans-serif'; g.fillText('Lớp Scratch 6–9 tuổi · Bài 4: Mèo đuổi chuột', 32, 42);
  g.fillStyle = '#ffffff'; g.fillRect(32, 96, 760, 600);
  g.fillStyle = '#dbeafe'; g.fillRect(56, 120, 712, 360);
  g.fillStyle = '#f59e0b'; g.beginPath(); g.arc(300, 300, 70, 0, 7); g.fill();
  g.fillStyle = '#64748b'; g.beginPath(); g.arc(520, 330, 40, 0, 7); g.fill();
  g.fillStyle = '#111827'; g.font = '20px sans-serif';
  ['Khi bấm cờ xanh', 'lặp lại mãi mãi', '  đi tới chuột', '  nếu chạm chuột thì nói "Bắt được rồi!"'].forEach((s, i) => g.fillText(s, 64, 530 + i * 34));
  g.fillStyle = '#ffffff'; g.fillRect(824, 96, 424, 600);
  g.fillStyle = '#111827'; g.font = 'bold 20px sans-serif'; g.fillText('Nhiệm vụ', 848, 136);
  g.font = '18px sans-serif'; ['1. Thêm nhân vật Mèo', '2. Thêm nhân vật Chuột', '3. Lập trình cho Mèo đuổi', '4. Đếm điểm khi bắt được'].forEach((s, i) => g.fillText(s, 848, 180 + i * 36));
  return c.toDataURL('image/png');
})()`);
await emit('region-captured', synth);
await sleep(1500);
await shot('2-editor');

await emit('show-shortcut-settings');
await shot('3-shortcut-settings');
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
await ev(`document.querySelector('[title="Đóng"]')?.click()`);
await sleep(400);

await emit('show-about');
await shot('4-about');
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await ev(`document.querySelector('[role="dialog"] [aria-label="Đóng"]')?.click()`);
await sleep(400);

// Back to the home screen, so the idle screen's state is shown again after the editor.
await ev(`[...document.querySelectorAll('button')].find(b => ['Chụp mới', 'New capture'].includes(b.textContent.trim()))?.click()`);
await sleep(600);
await shot('1b-home-after-editor');

// Region overlay over the synthetic image, with a drag selection so its action bar shows.
await ev(`window.__TAURI_INTERNALS__.invoke('start_region_capture', { dataUrl: ${JSON.stringify(synth)} })`);
let ot;
for (let i = 0; i < 40 && !ot; i++) {
  ot = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.url.includes('#overlay'));
  if (!ot) await sleep(250);
}
if (ot) {
  const ows = new WebSocket(ot.webSocketDebuggerUrl);
  await new Promise((r) => (ows.onopen = r));
  let oid = 0; const opend = new Map();
  ows.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && opend.has(d.id)) { opend.get(d.id)(d); opend.delete(d.id); } };
  const osend = (method, params = {}) => new Promise((r) => { const i = ++oid; opend.set(i, r); ows.send(JSON.stringify({ id: i, method, params })); });
  await sleep(1200);
  const drag = async (type, x, y) => osend('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'mouse' });
  await drag('mousePressed', 420, 260);
  for (let k = 1; k <= 8; k++) await drag('mouseMoved', 420 + k * 70, 260 + k * 40);
  await drag('mouseReleased', 980, 580);
  await sleep(900);
  const r = await osend('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(outDir, '6-region-overlay.png'), Buffer.from(r.result.data, 'base64'));
  console.log('saved 6-region-overlay');
  ows.close();
  await ev(`window.__TAURI_INTERNALS__.invoke('close_overlay', {})`);
  await sleep(600);
}

// Recording preview on a synthetic clip, if the app exposes the hook (dev builds of the redesign do).
const ff = [path.join(path.dirname(exe), 'ffmpeg.exe')].find(existsSync);
if (ff) {
  const clip = path.join(process.env.TEMP, 'edukids-ui-sample.mp4');
  try { execFileSync(ff, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=8', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', clip]); } catch {}
  await emit('recording-stopped', clip);
  await sleep(1500);
  await shot('5-recording-preview');
}

await ev(`window.__TAURI_INTERNALS__.invoke('set_language', { lang: 'vi' })`);
ws.close();
try { ps(`Stop-Process -Id ${app.pid} -Force -ErrorAction SilentlyContinue`); } catch {}
process.exit(0);
