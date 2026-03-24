import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { createCanvas } from 'canvas';

const projectRoot = process.cwd();
const iconsDir = path.join(projectRoot, 'src-tauri', 'icons');
const iconsetDir = path.join(iconsDir, 'icon.iconset');

const bgTop = '#12283E';
const bgBottom = '#081320';
const accentStart = '#9AF7E3';
const accentEnd = '#52D8F7';
const lensOuter = '#FF7B68';
const lensInner = '#FFE7E2';
const sparkle = '#FFE28A';

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed`);
  }
}

function writeIcoFromPng(pngPath, icoPath) {
  const png = readFileSync(pngPath);
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);

  const entry = Buffer.alloc(16);
  entry.writeUInt8(0, 0);
  entry.writeUInt8(0, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12);

  writeFileSync(icoPath, Buffer.concat([header, entry, png]));
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawMark(ctx, size, { transparent = false, tray = false } = {}) {
  const scale = size / 96;

  if (!transparent) {
    const gradient = ctx.createLinearGradient(12 * scale, 10 * scale, 84 * scale, 88 * scale);
    gradient.addColorStop(0, bgTop);
    gradient.addColorStop(1, bgBottom);
    roundedRect(ctx, 6 * scale, 6 * scale, 84 * scale, 84 * scale, 24 * scale);
    ctx.fillStyle = gradient;
    ctx.fill();

    roundedRect(ctx, 8.5 * scale, 8.5 * scale, 79 * scale, 79 * scale, 21.5 * scale);
    ctx.strokeStyle = 'rgba(255,255,255,0.09)';
    ctx.lineWidth = 2 * scale;
    ctx.stroke();
  }

  const accent = tray
    ? '#000000'
    : (() => {
        const gradient = ctx.createLinearGradient(28 * scale, 24 * scale, 70 * scale, 66 * scale);
        gradient.addColorStop(0, accentStart);
        gradient.addColorStop(1, accentEnd);
        return gradient;
      })();

  ctx.strokeStyle = accent;
  ctx.lineWidth = 7 * scale;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const corners = [
    [[31, 28], [22, 28], [22, 37]],
    [[65, 28], [74, 28], [74, 37]],
    [[31, 68], [22, 68], [22, 59]],
    [[65, 68], [74, 68], [74, 59]],
  ];

  for (const points of corners) {
    ctx.beginPath();
    ctx.moveTo(points[0][0] * scale, points[0][1] * scale);
    ctx.lineTo(points[1][0] * scale, points[1][1] * scale);
    ctx.lineTo(points[2][0] * scale, points[2][1] * scale);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(60.5 * scale, 35.5 * scale, 8.5 * scale, 0, Math.PI * 2);
  ctx.fillStyle = tray ? '#000000' : lensOuter;
  ctx.fill();

  if (!tray) {
    ctx.beginPath();
    ctx.arc(60.5 * scale, 35.5 * scale, 3.5 * scale, 0, Math.PI * 2);
    ctx.fillStyle = lensInner;
    ctx.fill();

    ctx.fillStyle = sparkle;
    ctx.beginPath();
    ctx.moveTo(66.5 * scale, 18 * scale);
    ctx.lineTo(68.4 * scale, 21.6 * scale);
    ctx.lineTo(72 * scale, 23.5 * scale);
    ctx.lineTo(68.4 * scale, 25.4 * scale);
    ctx.lineTo(66.5 * scale, 29 * scale);
    ctx.lineTo(64.6 * scale, 25.4 * scale);
    ctx.lineTo(61 * scale, 23.5 * scale);
    ctx.lineTo(64.6 * scale, 21.6 * scale);
    ctx.closePath();
    ctx.fill();
  }
}

function writePng(filePath, size, options = {}) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  drawMark(ctx, size, options);
  writeFileSync(filePath, canvas.toBuffer('image/png'));
}

function main() {
  ensureDir(iconsDir);
  if (existsSync(iconsetDir)) {
    rmSync(iconsetDir, { recursive: true, force: true });
  }
  ensureDir(iconsetDir);

  writePng(path.join(iconsDir, '32x32.png'), 32);
  writePng(path.join(iconsDir, '128x128.png'), 128);
  writePng(path.join(iconsDir, '128x128@2x.png'), 256);
  writePng(path.join(iconsDir, 'icon.png'), 1024);
  writePng(path.join(iconsDir, 'tray-icon.png'), 32, { transparent: true, tray: true });

  const iconsetFiles = [
    ['icon_16x16.png', 16],
    ['icon_16x16@2x.png', 32],
    ['icon_32x32.png', 32],
    ['icon_32x32@2x.png', 64],
    ['icon_128x128.png', 128],
    ['icon_128x128@2x.png', 256],
    ['icon_256x256.png', 256],
    ['icon_256x256@2x.png', 512],
    ['icon_512x512.png', 512],
    ['icon_512x512@2x.png', 1024],
  ];

  for (const [name, size] of iconsetFiles) {
    writePng(path.join(iconsetDir, name), size);
  }

  run('iconutil', ['-c', 'icns', iconsetDir, '-o', path.join(iconsDir, 'icon.icns')]);
  writeIcoFromPng(path.join(iconsDir, 'icon.png'), path.join(iconsDir, 'icon.ico'));
}

main();
