import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const siteUrl = process.env.GEOPINDER_TEST_URL || 'https://geopinder-arcade.vercel.app/';
const chromeBin = process.env.CHROME_BIN || 'chromium';
const debugPort = 9400 + (process.pid % 400);
const guestJoinDelayMs = Number(process.env.GEOPINDER_GUEST_JOIN_DELAY_MS || 500);
const enableRealtimeTrace = process.env.GEOPINDER_REALTIME_TRACE === '1';
const expectHostNoSelection = process.env.GEOPINDER_TEST_HOST_NO_SELECTION === '1';
const expectLobbyLeave = process.env.GEOPINDER_TEST_LOBBY_LEAVE === '1';
const profileDir = await mkdtemp(join(tmpdir(), 'geopinder-mp-cdp-'));
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
      // A page may reject a DevTools command while it is navigating. Retry until the deadline.
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
  await sleep(250);
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
  if (enableRealtimeTrace) {
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `(() => {
        const trace = (event, detail = {}) => {
          const list = window.__geopinderBrowserRealtimeTrace = window.__geopinderBrowserRealtimeTrace || [];
          list.push({ event, detail, at: Date.now() });
        };
        document.addEventListener('securitypolicyviolation', (event) => {
          trace('csp_violation', {
            directive: event.effectiveDirective,
            blockedURI: String(event.blockedURI || '').split('?')[0]
          });
        });
        let supabaseValue;
        Object.defineProperty(window, 'supabase', {
          configurable: true,
          get: () => supabaseValue,
          set: (next) => {
            supabaseValue = next;
            if (!next?.createClient || next.__geopinderTraceWrapped) return;
            try {
              const createClient = next.createClient.bind(next);
              next.createClient = (...args) => {
                const client = createClient(...args);
                const channel = client.channel.bind(client);
                client.channel = (...channelArgs) => {
                  const realtimeChannel = channel(...channelArgs);
                  const topic = String(channelArgs[0] || '');
                  const on = realtimeChannel.on.bind(realtimeChannel);
                  const subscribe = realtimeChannel.subscribe.bind(realtimeChannel);
                  const send = realtimeChannel.send.bind(realtimeChannel);
                  realtimeChannel.on = (type, filter, callback) => on(type, filter, (...callbackArgs) => {
                    trace('received', { type, event: filter?.event || null, topic });
                    return callback(...callbackArgs);
                  });
                  realtimeChannel.subscribe = (callback) => subscribe((status, error) => {
                    trace('subscribe_status', { status, topic, hasError: Boolean(error) });
                    return callback?.(status, error);
                  });
                  realtimeChannel.send = (message) => {
                    trace('send', { event: message?.event || null, topic });
                    const result = send(message);
                    Promise.resolve(result).then((status) => trace('send_result', { event: message?.event || null, status: String(status), topic })).catch((error) => trace('send_error', { event: message?.event || null, message: String(error), topic }));
                    return result;
                  };
                  return realtimeChannel;
                };
                return client;
              };
              next.__geopinderTraceWrapped = true;
            } catch (error) {
              trace('wrap_error', { message: String(error) });
            }
          }
        });
      })()`
    });
  }
  await client.send('Page.navigate', { url });
  return client;
}

async function installErrorCollector(client) {
  await evaluate(client, `(() => {
    window.__geopinderMultiplayerErrors = [];
    window.addEventListener('error', (event) => {
      window.__geopinderMultiplayerErrors.push({ message: event.message, line: event.lineno });
    });
    window.addEventListener('unhandledrejection', (event) => {
      window.__geopinderMultiplayerErrors.push({ message: String(event.reason), line: null });
    });
  })()`);
}

async function multiplayerState(client) {
  return evaluate(client, `(() => ({
    questionPanelVisible: !document.getElementById('quiz-panel').classList.contains('hidden'),
    waitingModalOpen: document.getElementById('waiting-modal').classList.contains('is-open'),
    startModalOpen: document.getElementById('start-modal').classList.contains('is-open'),
    waitMessage: document.getElementById('wait-msg').textContent,
    round: document.getElementById('round-display').textContent,
    errors: window.__geopinderMultiplayerErrors || [],
    toasts: [...document.querySelectorAll('.toast')].map((node) => node.textContent),
    realtimeTrace: [...(window.__geopinderRealtimeTrace || []), ...(window.__geopinderBrowserRealtimeTrace || [])]
  }))()`);
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
  await waitFor('host 2P button', async () => evaluate(host, `Boolean(document.getElementById('multi-btn'))`));
  await installErrorCollector(host);
  if (expectHostNoSelection) await evaluate(host, `document.querySelector('.diff-btn[data-diff="hard"]').click()`);
  await evaluate(host, `document.getElementById('multi-btn').click()`);

  const inviteUrl = await waitFor('host invite link', async () => evaluate(host, `(() => {
    const value = document.getElementById('invite-link').value;
    return value.includes('?room=') ? value : null;
  })()`));
  await waitFor('host waiting modal', async () => evaluate(host, `document.getElementById('waiting-modal').classList.contains('is-open')`));
  await sleep(guestJoinDelayMs);

  const guest = await openPage(browserUrl, inviteUrl);
  await waitFor('guest waiting modal', async () => evaluate(guest, `Boolean(document.getElementById('waiting-modal'))`));
  await installErrorCollector(guest);

  if (expectLobbyLeave) {
    await evaluate(host, `document.getElementById('leave-room-btn').click()`);
    await waitFor('host returns to start modal', async () => evaluate(host, `document.getElementById('start-modal').classList.contains('is-open') && !document.getElementById('waiting-modal').classList.contains('is-open')`));
    await waitFor('guest receives room cancellation', async () => evaluate(guest, `document.getElementById('start-modal').classList.contains('is-open') && !document.getElementById('waiting-modal').classList.contains('is-open')`));
    const [hostState, guestState] = await Promise.all([multiplayerState(host), multiplayerState(guest)]);
    if (hostState.questionPanelVisible || guestState.questionPanelVisible) throw new Error(`Lobby leave opened a question panel: ${JSON.stringify({ host: hostState, guest: guestState })}`);
    console.log('Multiplayer lobby leave E2E passed: host and guest returned to the start modal.');
  }

  if (!expectLobbyLeave) {
    try {
    await waitFor('both players to enter the first multiplayer round', async () => {
      const [hostState, guestState] = await Promise.all([multiplayerState(host), multiplayerState(guest)]);
      return hostState.questionPanelVisible && guestState.questionPanelVisible && !hostState.waitingModalOpen && !guestState.waitingModalOpen;
    });
  } catch (error) {
    const [hostState, guestState] = await Promise.all([multiplayerState(host), multiplayerState(guest)]);
    throw new Error(`${error.message} | diagnostics=${JSON.stringify({ host: hostState, guest: guestState })}`);
  }

  const [hostState, guestState] = await Promise.all([multiplayerState(host), multiplayerState(guest)]);
  if (hostState.round !== '1/5' || guestState.round !== '1/5') {
    throw new Error(`Unexpected multiplayer round state: ${JSON.stringify({ host: hostState, guest: guestState })}`);
  }

  if (expectHostNoSelection) {
    const timerValues = await Promise.all([host, guest].map((client) => evaluate(client, `Number(document.getElementById('time-display').textContent)`)));
    if (timerValues.some((value) => value > 10 || value < 9)) {
      throw new Error(`Hard multiplayer timer must start near 10 seconds: ${JSON.stringify(timerValues)}`);
    }
    const guestPoint = await evaluate(guest, `(() => ({ x: innerWidth / 2, y: innerHeight / 2 }))()`);
    await dispatchClick(guest, guestPoint.x, guestPoint.y);
    await waitFor('guest pin placement', async () => evaluate(guest, `document.getElementById('submit-btn').disabled === false`));
    await evaluate(guest, `document.getElementById('submit-btn').click()`);
    try {
      await waitFor('no-selection multiplayer result', async () => {
        const [hostResultOpen, guestResultOpen] = await Promise.all([
          evaluate(host, `document.getElementById('result-modal').classList.contains('is-open')`),
          evaluate(guest, `document.getElementById('result-modal').classList.contains('is-open')`)
        ]);
        return hostResultOpen && guestResultOpen;
      }, 35_000);
    } catch (error) {
      const diagnostics = await Promise.all([host, guest].map((client) => evaluate(client, `(() => ({
        timer: document.getElementById('time-display').textContent,
        submitDisabled: document.getElementById('submit-btn').disabled,
        submitText: document.getElementById('submit-btn').textContent,
        resultOpen: document.getElementById('result-modal').classList.contains('is-open'),
        title: document.getElementById('result-title').textContent,
        score: document.getElementById('result-score').textContent,
        opponentDistance: document.getElementById('opp-dist').textContent,
        toasts: [...document.querySelectorAll('.toast')].map((node) => node.textContent)
      }))()`)));
      throw new Error(`${error.message} | diagnostics=${JSON.stringify({ host: diagnostics[0], guest: diagnostics[1] })}`);
    }
    const noSelectionState = await Promise.all([
      evaluate(host, `({ title: document.getElementById('result-title').textContent, score: document.getElementById('result-score').textContent })`),
      evaluate(guest, `({ opponentDistance: document.getElementById('opp-dist').textContent, opponentVisible: document.getElementById('opponent-result').style.display !== 'none' })`)
    ]);
    const [hostResult, guestResult] = noSelectionState;
    if (hostResult.title !== 'NO PICK' || hostResult.score !== '+ 0 PTS' || guestResult.opponentDistance !== '선택 안 함' || !guestResult.opponentVisible) {
      throw new Error(`Unexpected multiplayer no-selection state: ${JSON.stringify({ hostResult, guestResult })}`);
    }
    console.log('Multiplayer no-selection E2E passed: timed-out host received 0 points and guest saw 선택 안 함.');
    } else {
      console.log('Multiplayer start E2E passed: host and guest entered round 1 with waiting modals closed.');
    }
  }
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
