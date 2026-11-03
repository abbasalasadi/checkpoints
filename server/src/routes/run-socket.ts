/**
 * /ws/runs/:id — live output for one run (Go protocol): JSON messages
 * {type:'state'|'output'|'done', ...}.
 *
 * Authenticates from the session cookie on the upgrade, and refuses a run that
 * belongs to someone else with the same 404 as a missing one.
 */

import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { logger } from '../logger.js';
import { resolveCaller } from '../middleware/http.js';
import { getRun, type RunEventLike, type RunLike } from '../services/runs.js';

export const RUN_SOCKET_PATTERN = /^\/ws\/runs\/([A-Za-z0-9_-]{1,64})$/;

export function createRunSocketServer() {
  const wss = new WebSocketServer({ noServer: true });

  async function upgrade(req: IncomingMessage, socket: Duplex, head: Buffer, runId: string): Promise<void> {
    const caller = resolveCaller(req);
    const run = caller ? await getRun(runId) : undefined;
    if (!caller || !run || String(run.user) !== String(caller.user.id)) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => stream(ws, run));
  }

  return { wss, upgrade };
}

function stream(ws: WebSocket, run: RunLike): void {
  const send = (evt: RunEventLike) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(evt));
  };

  const finish = () => {
    send({
      type: 'done',
      outcome: run.outcome ?? null,
      exitCode: run.exitCode ?? null,
      durationMs: run.durationMs ?? null,
      truncated: run.truncated ?? false,
    });
    ws.close();
  };

  // Whatever arrived before the socket opened, so nothing is lost in the gap
  // between the POST returning and the browser connecting.
  send({ type: 'state', state: run.state, queuePosition: run.queuePosition ?? 0 });
  if (run.output) send({ type: 'output', text: run.output });
  if (run.state === 'done') {
    finish();
    return;
  }

  const onEvent = (evt: RunEventLike) => {
    send(evt);
    if (evt.type === 'done') {
      cleanup();
      ws.close();
    }
  };
  const cleanup = () => run.events.off('event', onEvent);
  run.events.on('event', onEvent);
  ws.on('close', cleanup);
  ws.on('error', (err) => {
    logger.warn('run_socket.error', { error: String(err) });
    cleanup();
  });
}
