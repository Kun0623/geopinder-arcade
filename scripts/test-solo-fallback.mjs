import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const siteUrl = process.env.GEOPINDER_TEST_URL || 'http://127.0.0.1:4173/';
const chromeBin = process.env.CHROME_BIN || 'chromium';
const debugPort = 9300 + (process.pid % 500);
const expectNoSelection = process.env.GEOPINDER_TEST_EXPECT_NO_SELECTION === '1';
const testDifficulty = process.env.GEOPINDER_TEST_DIFFICULTY || (expectNoSelection ? 'hard' : 'easy');
const expectedTimerSeconds = { easy: null, normal: 20, hard: 10 }[testDifficulty];
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
  await evaluate(client, `localStorage.setItem('geopinder.playerInitials.v1', 'g9p'); location.reload()`);
  await waitFor('remembered initials after reload', async () => evaluate(client, `(() => {
    const input = document.getElementById('initials-input');
    const note = document.getElementById('initials-memory-note');
    return Boolean(document.querySelector('#globeViz canvas')) && input.value === 'G9P' && note.hidden === false;
  })()`));

  if (!Object.hasOwn({ easy: null, normal: 20, hard: 10 }, testDifficulty)) {
    throw new Error(`Unsupported GEOPINDER_TEST_DIFFICULTY: ${testDifficulty}`);
  }
  await evaluate(client, `document.querySelector('.diff-btn[data-diff="${testDifficulty}"]').click()`);
  // 라운드 시작은 DOM 클릭으로 고정하고, 실제 회귀 대상인 3D 캔버스의 포인터 입력은 아래에서 CDP 마우스 이벤트로 검증한다.
  await evaluate(client, `document.getElementById('start-btn').click()`);

  try {
    await waitFor('Supabase-free 1P demo round', async () => evaluate(client, `(() => {
      const panel = document.getElementById('quiz-panel');
      const modal = document.getElementById('start-modal');
      const hint = document.getElementById('quiz-hint');
      return !modal.classList.contains('is-open') && !panel.classList.contains('hidden') && hint.textContent.includes('“');
    })()`));
  } catch (error) {
    const diagnostics = await evaluate(client, `(() => ({
      configured: Boolean(window.GEOPINDER_CONFIG?.supabaseUrl && window.GEOPINDER_CONFIG?.supabaseAnonKey),
      startText: document.getElementById('start-btn').textContent,
      startDisabled: document.getElementById('start-btn').disabled,
      modalOpen: document.getElementById('start-modal').classList.contains('is-open'),
      panelHidden: document.getElementById('quiz-panel').classList.contains('hidden'),
      hint: document.getElementById('quiz-hint').textContent,
      toasts: [...document.querySelectorAll('.toast')].map((node) => node.textContent)
    }))()`);
    throw new Error(`${error.message} | diagnostics=${JSON.stringify(diagnostics)}`);
  }

  const timerState = await evaluate(client, `(() => {
    const timer = document.getElementById('hud-timer');
    return {
      value: document.getElementById('time-display').textContent,
      visibility: getComputedStyle(timer).visibility,
      ariaHidden: timer.getAttribute('aria-hidden'),
      timelessHud: document.querySelector('.hud-top').classList.contains('hud-top--timeless')
    };
  })()`);
  if (expectedTimerSeconds === null) {
    if (timerState.visibility !== 'hidden' || timerState.ariaHidden !== 'true' || !timerState.timelessHud) {
      throw new Error(`Easy mode must hide the timer, received: ${JSON.stringify(timerState)}`);
    }
  } else {
    const initialTimerValue = Number(timerState.value);
    if (timerState.visibility !== 'visible' || timerState.ariaHidden !== 'false' || timerState.timelessHud || initialTimerValue > expectedTimerSeconds || initialTimerValue < expectedTimerSeconds - 1) {
      throw new Error(`${testDifficulty} timer must start near ${expectedTimerSeconds}, received: ${JSON.stringify(timerState)}`);
    }
    await waitFor(`${testDifficulty} timer decrement`, async () => evaluate(client, `Number(document.getElementById('time-display').textContent) < ${expectedTimerSeconds}`));
  }

  if (process.env.GEOPINDER_TEST_START_SCREENSHOT) {
    const screenshot = await client.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(process.env.GEOPINDER_TEST_START_SCREENSHOT, Buffer.from(screenshot.data, 'base64'));
  }

  let completionMessage;
  if (expectNoSelection) {
    try {
      await waitFor('no-selection result modal', async () => evaluate(client, `document.getElementById('result-modal').classList.contains('is-open')`), 30_000);
    } catch (error) {
      const diagnostics = await evaluate(client, `(() => ({
        timer: document.getElementById('time-display').textContent,
        submitDisabled: document.getElementById('submit-btn').disabled,
        submitText: document.getElementById('submit-btn').textContent,
        resultOpen: document.getElementById('result-modal').classList.contains('is-open'),
        title: document.getElementById('result-title').textContent,
        score: document.getElementById('result-score').textContent,
        markerCount: document.querySelectorAll('.globe-marker__icon').length,
        toasts: [...document.querySelectorAll('.toast')].map((node) => node.textContent)
      }))()`);
      throw new Error(`${error.message} | diagnostics=${JSON.stringify(diagnostics)}`);
    }
    const noSelectionResult = await evaluate(client, `({
      title: document.getElementById('result-title').textContent,
      distance: document.getElementById('result-distance').textContent,
      score: document.getElementById('result-score').textContent,
      markerViewBoxes: [...document.querySelectorAll('.globe-marker__icon')].map((marker) => marker.getAttribute('viewBox'))
    })`);
    const targetOnly = noSelectionResult.markerViewBoxes.length === 1 && noSelectionResult.markerViewBoxes[0] === '0 0 56 56';
    if (noSelectionResult.title !== 'NO PICK' || noSelectionResult.distance !== '선택 안 함' || noSelectionResult.score !== '+ 0 PTS' || !targetOnly) {
      throw new Error(`Unexpected no-selection result: ${JSON.stringify(noSelectionResult)}`);
    }
    completionMessage = 'No-selection E2E passed: timer expiry shows NO PICK and awards 0 points.';
  } else {
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
    await waitFor('SVG globe marker render', async () => evaluate(client, `document.querySelector('.globe-marker__icon')?.tagName?.toLowerCase() === 'svg'`));
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
  const result = await evaluate(client, `({
    hint: document.getElementById('quiz-hint').textContent,
    submitEnabled: !document.getElementById('submit-btn').disabled,
    markerTag: document.querySelector('.globe-marker__icon')?.tagName?.toLowerCase() || null
  })`);

  if (!result.submitEnabled || result.markerTag !== 'svg') throw new Error(`Unexpected 1P demo state: ${JSON.stringify(result)}`);
  await evaluate(client, `document.getElementById('submit-btn').click()`);
  await waitFor('SVG target marker render', async () => evaluate(client, `document.querySelectorAll('.globe-marker__icon').length >= 2`));
  const markerViewBoxes = await evaluate(client, `[...document.querySelectorAll('.globe-marker__icon')].map((marker) => marker.getAttribute('viewBox'))`);
  if (!markerViewBoxes.includes('0 0 48 56') || !markerViewBoxes.includes('0 0 56 56')) {
    throw new Error(`Expected SVG pin and target markers, received: ${JSON.stringify(markerViewBoxes)}`);
  }
  if (process.env.GEOPINDER_TEST_SCREENSHOT) {
    const screenshot = await client.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(process.env.GEOPINDER_TEST_SCREENSHOT, Buffer.from(screenshot.data, 'base64'));
  }
  completionMessage = `Solo fallback E2E passed: ${result.hint}`;
  }
  console.log(completionMessage);
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
