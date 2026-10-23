import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const siteUrl = process.env.GEOPINDER_TEST_URL || 'http://127.0.0.1:4173/';
const chromeBin = process.env.CHROME_BIN || 'chromium';
const debugPort = 9300 + (process.pid % 500);
const profileDir = await mkdtemp(join(tmpdir(), 'geopinder-cdp-'));
let chrome;
let ws;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(label, predicate, timeoutMs = 15_000, intervalMs = 80) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const value = await predicate();
      if (value) return value;
    } catch {
      // Chrome can reject a request during target navigation; retry until the deadline.
    }
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function createCdpClient(webSocketUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketUrl);
    const pending = new Map();
    let nextId = 0;

    socket.addEventListener('open', () => {
      resolve({
        socket,
        send(method, params = {}) {
          const id = ++nextId;
          return new Promise((resolveCommand, rejectCommand) => {
            pending.set(id, { resolve: resolveCommand, reject: rejectCommand });
            socket.send(JSON.stringify({ id, method, params }));
          });
        }
      });
    });

    socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      if (!message.id) return;
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.error) request.reject(new Error(`${message.error.message} (${message.error.code})`));
      else request.resolve(message.result);
    });

    socket.addEventListener('error', () => reject(new Error('Chrome DevTools WebSocket connection failed.')));
    socket.addEventListener('close', () => {
      for (const request of pending.values()) request.reject(new Error('Chrome DevTools WebSocket closed.'));
      pending.clear();
    });
  });
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Page evaluation failed.');
  return result.result?.value;
}

async function dispatchClick(client, x, y) {
  await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
  await sleep(250);
  await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}

try {
  chrome = spawn(chromeBin, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    '--window-size=1280,720',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profileDir}`,
    'about:blank'
  ], { stdio: 'ignore' });

  const version = await waitFor('Chrome DevTools endpoint', async () => {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
    return response.ok ? response.json() : null;
  });

  const targetResponse = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(siteUrl)}`, { method: 'PUT' });
  if (!targetResponse.ok) throw new Error(`Could not create browser target: ${targetResponse.status}`);
  const target = await targetResponse.json();
  const client = await createCdpClient(target.webSocketDebuggerUrl);
  ws = client.socket;

  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await waitFor('3D globe and 1P start button', async () => evaluate(client, `Boolean(document.querySelector('#globeViz canvas') && document.getElementById('start-btn'))`));

  const startBox = await evaluate(client, `(() => { const rect = document.getElementById('start-btn').getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; })()`);
  await dispatchClick(client, startBox.x, startBox.y);

  await waitFor('Supabase-free 1P demo round', async () => evaluate(client, `(() => {
    const panel = document.getElementById('quiz-panel');
    const modal = document.getElementById('start-modal');
    const hint = document.getElementById('quiz-hint');
    return !modal.classList.contains('is-open') && !panel.classList.contains('hidden') && hint.textContent.includes('“');
  })()`));

  await evaluate(client, `(() => {
    window.__geopinderClickDebug = [];
    window.__geopinderRuntimeErrors = [];
    document.addEventListener('click', (event) => {
      window.__geopinderClickDebug.push({
        x: Math.round(event.clientX),
        y: Math.round(event.clientY),
        target: event.target?.tagName,
        targetId: event.target?.id || null
      });
    }, { capture: true });
    window.addEventListener('error', (event) => {
      window.__geopinderRuntimeErrors.push({ message: event.message, filename: event.filename, line: event.lineno });
    });
    window.addEventListener('unhandledrejection', (event) => {
      window.__geopinderRuntimeErrors.push({ message: String(event.reason), filename: null, line: null });
    });
  })()`);

  const globePoint = await evaluate(client, `(() => ({ x: innerWidth / 2, y: innerHeight / 2 }))()`);
  await dispatchClick(client, globePoint.x, globePoint.y);

  try {
    await waitFor('globe flag placement', async () => evaluate(client, `document.getElementById('submit-btn').disabled === false`));
  } catch (error) {
    const screenshot = await client.send('Page.captureScreenshot', { format: 'png' });
    const screenshotPath = '/tmp/geopinder-solo-fallback-debug.png';
    await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));
    const diagnostics = await evaluate(client, `(() => ({
      viewport: { width: innerWidth, height: innerHeight },
      point: ${JSON.stringify(globePoint)},
      elementAtPoint: document.elementFromPoint(${globePoint.x}, ${globePoint.y})?.tagName || null,
      submitDisabled: document.getElementById('submit-btn').disabled,
      timer: document.getElementById('time-display').textContent,
      round: document.getElementById('round-display').textContent,
      clickEvents: window.__geopinderClickDebug || [],
      callbackEvents: window.__geopinderCallbackDebug || [],
      handlerEvents: window.__geopinderHandlerDebug || [],
      runtimeErrors: window.__geopinderRuntimeErrors || []
    }))()`);
    throw new Error(`${error.message} | screenshot=${screenshotPath} | diagnostics=${JSON.stringify(diagnostics)}`);
  }
  const result = await evaluate(client, `({ hint: document.getElementById('quiz-hint').textContent, submitEnabled: !document.getElementById('submit-btn').disabled })`);

  if (!result.submitEnabled) throw new Error(`Unexpected 1P demo state: ${JSON.stringify(result)}`);
  console.log(`Solo fallback E2E passed: ${result.hint}`);
  void version;
} finally {
  ws?.close();
  if (chrome && !chrome.killed) {
    const exited = new Promise((resolve) => chrome.once('exit', resolve));
    chrome.kill('SIGTERM');
    await Promise.race([exited, sleep(3_000)]);
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await rm(profileDir, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
      break;
    } catch (error) {
      if (attempt === 2) throw error;
      await sleep(250);
    }
  }
}
