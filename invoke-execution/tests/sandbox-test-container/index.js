'use strict';

// ============================================================================
// Sandbox test container — IPC client
//
// Connects to /run/events.sock (the host IPC server) and handles test events:
//   ping          → pong          (echo payload)
//   ping-binary   → pong-binary   (echo payload + binary buffer)
//   http-test     → http-result   (make HTTP GET, report outcome)
// ============================================================================

const net = require('net');
const http = require('http');

const EVENTS_SOCK = '/run/events.sock';

// ── IPC framing helpers ──────────────────────────────────────────────────────

function sendText(socket, event, payload) {
  socket.write(Buffer.from(JSON.stringify({ event, payload }) + '\n', 'utf8'));
}

function sendBinary(socket, event, payload, buffer) {
  const header = Buffer.from(
    JSON.stringify({ event, payload, binary: true, size: buffer.length }) + '\n',
    'utf8'
  );
  socket.write(header);
  socket.write(buffer);
}

/**
 * Returns an 'onData' handler implementing the same binary-aware framing
 * as the host Sandbox._setupIpcReader.
 */
function makeReader(onText, onBinary) {
  let textBuf = Buffer.alloc(0);
  let binHeader = null;
  let binBuf = Buffer.alloc(0);

  return function onData(chunk) {
    let data = chunk;

    while (data.length > 0) {
      if (binHeader) {
        // BINARY mode: accumulate exactly binHeader.size bytes
        const remaining = binHeader.size - binBuf.length;
        const take = Math.min(remaining, data.length);
        binBuf = Buffer.concat([binBuf, data.subarray(0, take)]);
        data = data.subarray(take);

        if (binBuf.length === binHeader.size) {
          onBinary(binHeader.event, binHeader.payload, binBuf);
          binHeader = null;
          binBuf = Buffer.alloc(0);
        }
      } else {
        // TEXT mode: buffer until '\n'
        const nl = data.indexOf(0x0a);
        if (nl === -1) {
          textBuf = Buffer.concat([textBuf, data]);
          data = Buffer.alloc(0);
        } else {
          const line = Buffer.concat([textBuf, data.subarray(0, nl)]);
          textBuf = Buffer.alloc(0);
          data = data.subarray(nl + 1);

          let parsed;
          try {
            parsed = JSON.parse(line.toString('utf8'));
          } catch {
            continue; // malformed JSON — skip
          }

          if (parsed.binary === true && typeof parsed.size === 'number') {
            binHeader = parsed;
            binBuf = Buffer.alloc(0);
          } else {
            onText(parsed.event, parsed.payload);
          }
        }
      }
    }
  };
}

// ── HTTP helper ──────────────────────────────────────────────────────────────

function doHttpGet(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 5000 }, (res) => {
      res.resume(); // drain
      resolve({ ok: true, status: res.statusCode });
    });
    req.on('error', (err) => resolve({ ok: false, error: err.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'timeout' });
    });
  });
}

// ── Connect to host IPC server ───────────────────────────────────────────────

const MAX_RETRIES = 20;
const RETRY_DELAY_MS = 500;

function connectWithRetry(retries) {
  const socket = net.createConnection(EVENTS_SOCK);

  socket.on('connect', () => {
    console.log('[test-container] connected to IPC socket');
    sendText(socket, 'ready', null);

    socket.on(
      'data',
      makeReader(
        // Text event handler
        async (event, payload) => {
          if (event === 'ping') {
            sendText(socket, 'pong', payload);
          } else if (event === 'http-test') {
            // payload is the URL to GET
            const result = await doHttpGet(payload);
            sendText(socket, 'http-result', result);
          }
        },
        // Binary event handler
        (event, payload, buffer) => {
          if (event === 'ping-binary') {
            sendBinary(socket, 'pong-binary', payload, buffer);
          }
        }
      )
    );
  });

  socket.on('error', (err) => {
    if (retries > 0) {
      setTimeout(() => connectWithRetry(retries - 1), RETRY_DELAY_MS);
    } else {
      console.error('[test-container] could not connect to IPC socket:', err.message);
      process.exit(1);
    }
  });

  socket.on('close', () => {
    console.log('[test-container] IPC socket closed, exiting');
    process.exit(0);
  });
}

connectWithRetry(MAX_RETRIES);
