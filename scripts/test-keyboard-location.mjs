import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const siteUrl = process.env.GEOPINDER_TEST_URL || 'https://geopinder-arcade.vercel.app/';
const chromeBin = process.env.CHROME_BIN || 'chromium';
const debugPort = 9500 + (process.pid % 300);
const profileDir = await mkdtemp(join(tmpdir(), 'geopinder-keyboard-cdp-'));
let chrome;
let socket;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(label, predicate, timeoutMs = 18_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { const value = await predicate(); if (value) return value; } catch { /* retry */ }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}
function cdp(url) {
  return new Promise((resolve, reject) => {
    socket = new WebSocket(url);
    const pending = new Map();
    let nextId = 0;
    socket.addEventListener('open', () => resolve({
      send(method, params = {}) {
        const id = ++nextId;
        return new Promise((ok, fail) => {
          pending.set(id, { ok, fail });
          socket.send(JSON.stringify({ id, method, params }));
        });
      }
    }));
    socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      if (!message.id || !pending.has(message.id)) return;
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request.fail(new Error(message.error.message)); else request.ok(message.result);
    });
    socket.addEventListener('error', () => reject(new Error('CDP WebSocket failed')));
  });
}
async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Page evaluation failed');
  return result.result?.value;
}

try {
  chrome = spawn(chromeBin, ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=390,844', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profileDir}`, 'about:blank'], { stdio: 'ignore' });
  const version = await waitFor('Chrome DevTools endpoint', async () => {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
    return response.ok ? response.json() : null;
  });
  const targetResponse = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' });
  const target = await targetResponse.json();
  const client = await cdp(target.webSocketDebuggerUrl);
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Page.navigate', { url: siteUrl });
  await waitFor('start button', async () => evaluate(client, `Boolean(document.getElementById('start-btn'))`));
  await evaluate(client, `document.getElementById('start-btn').click()`);
  await waitFor('quiz panel', async () => evaluate(client, `!document.getElementById('quiz-panel').classList.contains('hidden')`));
  await waitFor('country options', async () => evaluate(client, `document.querySelector('#country-options option[value="France"]')`));
  await evaluate(client, `document.getElementById('country-search').value = 'France'; document.getElementById('apply-location-btn').click()`);
  await waitFor('country keyboard pin', async () => evaluate(client, `document.getElementById('submit-btn').disabled === false && document.getElementById('keyboard-picker-status').textContent.includes('France')`));
  await evaluate(client, `document.getElementById('country-search').value = ''; document.getElementById('latitude-input').value = '48.8584'; document.getElementById('longitude-input').value = '2.2945'; document.getElementById('apply-location-btn').click()`);
  await waitFor('keyboard location applied', async () => evaluate(client, `document.getElementById('submit-btn').disabled === false && document.getElementById('keyboard-picker-status').textContent.includes('입력한 좌표 위치를 선택했습니다')`));
  const state = await evaluate(client, `({ status: document.getElementById('keyboard-picker-status').textContent, submit: document.getElementById('submit-btn').disabled, markers: document.querySelectorAll('.globe-marker__icon').length })`);
  if (!state.status.includes('입력한 좌표 위치를 선택했습니다') || state.submit) throw new Error(`Unexpected keyboard selection state: ${JSON.stringify(state)}`);
  console.log('Keyboard location E2E passed:', JSON.stringify(state));
} finally {
  socket?.close();
  if (chrome) {
    chrome.kill('SIGTERM');
    await sleep(350);
  }
  await rm(profileDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 });
}
