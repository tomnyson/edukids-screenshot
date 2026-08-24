import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const DEV_HOST = 'localhost';
const DEV_PORT = 1420;
const DEV_URL = `http://${DEV_HOST}:${DEV_PORT}`;
const VITE_CLIENT_MARKER = '/@vite/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const viteBin = path.join(
  projectRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'vite.cmd' : 'vite'
);

async function canAccess(filePath) {
  try {
    await access(filePath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function canConnect(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });

    const finish = (value) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(value);
    };

    socket.setTimeout(1000);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);

  try {
    const response = await fetch(url, { signal: controller.signal });
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function inspectExistingServer() {
  try {
    const html = await fetchHtml(DEV_URL);
    if (html.includes(VITE_CLIENT_MARKER)) {
      return 'vite';
    }
    return 'other-http';
  } catch {
    return (await canConnect(DEV_HOST, DEV_PORT)) ? 'occupied' : 'free';
  }
}

function runVite() {
  const child = spawn(viteBin, [], {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
  });

  const forwardSignal = (signal) => {
    if (!child.killed) {
      child.kill(signal);
    }
  };

  process.on('SIGINT', forwardSignal);
  process.on('SIGTERM', forwardSignal);

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

async function main() {
  if (!(await canAccess(viteBin))) {
    console.error(`Unable to find the Vite binary at ${viteBin}.`);
    process.exit(1);
  }

  const serverState = await inspectExistingServer();

  if (serverState === 'vite') {
    console.log(`Reusing existing Vite dev server at ${DEV_URL}`);
    return;
  }

  if (serverState !== 'free') {
    console.error(
      `Port ${DEV_PORT} is already in use by another process. Stop that process or free the port, then try again.`
    );
    process.exit(1);
  }

  runVite();
}

await main();
