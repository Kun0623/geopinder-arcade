import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const siteUrl = process.env.GEOPINDER_TEST_URL || 'https://geopinder-arcade.vercel.app/';
const chromeBin = process.env.CHROME_BIN || 'chromium';
const debugPort = 9600 + (process.pid % 300);
const profileDir = await mkdtemp(join(tmpdir(), 'geopinder-rematch-cdp-'));
let chrome;
const sockets = [];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(label, predicate, timeoutMs = 18_000, intervalMs = 100) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const value = await predicate();
      if (value) return value;
    } catch {
      // A page may reject a command while its Globe.gl scene is changing; retry until the deadline.
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
      sockets.push(socket);
      resolve({
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
  await sleep(180);
  await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}

async function openPage(browserUrl, url) {
  const response = await fetch(`${browserUrl}/json/new?about:blank`, { method: 'PUT' });
  if (!response.ok) throw new Error(`Could not create browser target: ${response.status}`);
  const target = await response.json();
  const client = await createCdpClient(target.webSocketDebuggerUrl);
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Page.navigate', { url });
  return client;
}

async function gameState(client) {
  return evaluate(client, `(() => ({
    round: document.getElementById('round-display').textContent,
    score: document.getElementById('score-display').textContent,
    quizVisible: !document.getElementById('quiz-panel').classList.contains('hidden'),
    gameOverOpen: document.getElementById('gameover-modal').classList.contains('is-open'),
    resultOpen: document.getElementById('result-modal').classList.contains('is-open'),
    rematchPresent: Boolean(document.getElementById('rematch-btn')),
    rematchHidden: document.getElementById('rematch-btn')?.hidden ?? null,
    rematchDisabled: document.getElementById('rematch-btn')?.disabled ?? null,
    url: location.pathname + location.search,
    toasts: [...document.querySelectorAll('.toast')].map((node) => node.textContent)
  }))()`);
}

async function placeAndSubmit(client) {
  await client.send('Page.bringToFront');
  await sleep(160);
  const point = await evaluate(client, `(() => ({ x: innerWidth / 2, y: innerHeight / 2 }))()`);
  await dispatchClick(client, point.x, point.y);
  await waitFor('player pin placement', async () => evaluate(client, `document.getElementById('submit-btn').disabled === false`));
  await evaluate(client, `document.getElementById('submit-btn').click()`);
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

  const browserVersion = await waitFor('Chrome DevTools endpoint', async () => {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
    return response.ok ? response.json() : null;
  });
  const browserUrl = `http://127.0.0.1:${debugPort}`;

  const host = await openPage(browserUrl, siteUrl);
  await waitFor('host multiplayer button', async () => evaluate(host, `Boolean(document.getElementById('multi-btn'))`));
  await evaluate(host, `document.getElementById('multi-btn').click()`);
  const inviteUrl = await waitFor('host invite URL', async () => evaluate(host, `(() => {
    const url = document.getElementById('invite-link').value;
    return url.includes('?room=') ? url : null;
  })()`));
  const guest = await openPage(browserUrl, inviteUrl);

  await waitFor('first multiplayer round', async () => {
    const [hostState, guestState] = await Promise.all([gameState(host), gameState(guest)]);
    return hostState.quizVisible && guestState.quizVisible && hostState.round === '1/5' && guestState.round === '1/5';
  });

  for (let round = 1; round <= 5; round += 1) {
    await placeAndSubmit(host);
    await placeAndSubmit(guest);
    await waitFor(`round ${round} results`, async () => {
      const [hostState, guestState] = await Promise.all([gameState(host), gameState(guest)]);
      return hostState.resultOpen && guestState.resultOpen;
    });
    await evaluate(host, `document.getElementById('next-btn').click()`);
    if (round < 5) {
      const expectedRound = `${round + 1}/5`;
      try {
        await waitFor(`round ${round + 1} start`, async () => {
          const [hostState, guestState] = await Promise.all([gameState(host), gameState(guest)]);
          return hostState.round === expectedRound && guestState.round === expectedRound && !hostState.resultOpen && !guestState.resultOpen;
        });
      } catch (error) {
        const states = await Promise.all([gameState(host), gameState(guest)]);
        throw new Error(`${error.message} | diagnostics=${JSON.stringify({ host: states[0], guest: states[1] })}`);
      }
    }
  }

  await waitFor('both game-over modals', async () => {
    const [hostState, guestState] = await Promise.all([gameState(host), gameState(guest)]);
    return hostState.gameOverOpen && guestState.gameOverOpen;
  }, 14_000);

  const beforeVote = await Promise.all([gameState(host), gameState(guest)]);
  if (!beforeVote.every((state) => state.rematchPresent && state.rematchHidden === false)) {
    throw new Error(`Expected visible rematch CTAs after 2P game over: ${JSON.stringify(beforeVote)}`);
  }

  await evaluate(guest, `document.getElementById('rematch-btn').click()`);
  await waitFor('guest rematch waiting state', async () => evaluate(guest, `document.getElementById('rematch-btn').disabled === true`));
  await sleep(800);
  const afterSingleVote = await Promise.all([gameState(host), gameState(guest)]);
  if (!afterSingleVote.every((state) => state.gameOverOpen && state.round === '5/5')) {
    throw new Error(`A single rematch vote must not start a match: ${JSON.stringify(afterSingleVote)}`);
  }

  await evaluate(host, `document.getElementById('rematch-btn').click()`);
  await waitFor('both players in rematch round 1', async () => {
    const [hostState, guestState] = await Promise.all([gameState(host), gameState(guest)]);
    return hostState.quizVisible && guestState.quizVisible
      && !hostState.gameOverOpen && !guestState.gameOverOpen
      && hostState.round === '1/5' && guestState.round === '1/5'
      && hostState.score === '00000' && guestState.score === '00000';
  });

  const afterRematch = await Promise.all([gameState(host), gameState(guest)]);
  const expectedGuestRoomPath = new URL(inviteUrl).pathname + new URL(inviteUrl).search;
  if (afterRematch[0].url.includes('?room=') || afterRematch[1].url !== expectedGuestRoomPath) {
    throw new Error(`Rematch must preserve the guest room URL without changing the host page: ${JSON.stringify(afterRematch)}`);
  }
  console.log('Multiplayer rematch E2E passed: both players voted, the same room reset to round 1, and both scores cleared.');
  void browserVersion;
} finally {
  sockets.forEach((socket) => socket.close());
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
