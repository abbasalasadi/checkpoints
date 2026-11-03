/**
 * /ws/terminal — the PTY bridge.
 *
 * node-pty forks a real pseudo-terminal around `docker exec -it`, so cargo sees
 * a tty and emits colour. Bytes flow straight through in both directions; the
 * server does not interpret them.
 *
 * Authentication happens on the upgrade request. A WebSocket that skipped the
 * session check would be an unauthenticated shell into a container.
 */

import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import * as pty from 'node-pty';
import { WebSocketServer, type WebSocket } from 'ws';
import { config } from '../config/index.js';
import { logger } from '../logger.js';
import { resolveCaller } from '../middleware/http.js';
import { runner } from '../services/runner/index.js';

interface ClientMessage {
  type: 'input' | 'resize';
  data?: string;
  cols?: number;
  rows?: number;
}

export function createTerminalServer() {
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage, containerId: string, userId: number) => {
    // `docker exec -it` gives the shell a tty; node-pty gives US a tty so the
    // whole chain is a real terminal rather than a pipe.
    const term = pty.spawn('docker', ['exec', '-it', '-w', '/workspace', containerId, '/bin/bash', '-l'], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: process.cwd(),
      env: process.env as Record<string, string>,
    });

    // Hold the container while this terminal is open, or the idle reaper kills
    // it mid-session and the student sees "[terminal disconnected]".
    runner.attachTerminal(String(userId));
    logger.info('terminal.opened', { userId, containerId: containerId.slice(0, 12), pid: term.pid });

    term.onData((data) => {
      // Output counts as activity, so a long compile never looks idle.
      runner.touch(String(userId));
      if (ws.readyState === ws.OPEN) ws.send(data);
    });

    term.onExit(({ exitCode }) => {
      logger.info('terminal.exited', { userId, exitCode });
      if (ws.readyState === ws.OPEN) ws.close(1000, 'terminal exited');
    });

    ws.on('message', (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        return;
      }
      if (msg.type === 'input' && typeof msg.data === 'string') {
        runner.touch(String(userId));
        term.write(msg.data);
      } else if (msg.type === 'resize' && msg.cols && msg.rows) {
        // Without this, output wraps at the wrong column after a window resize.
        term.resize(Math.max(2, Math.min(500, msg.cols)), Math.max(2, Math.min(200, msg.rows)));
      }
    });

    ws.on('close', () => {
      runner.detachTerminal(String(userId));
      logger.info('terminal.closed', { userId });
      try {
        term.kill();
      } catch {
        // already gone
      }
    });
  });

  /** Handle the HTTP upgrade, authenticating before any PTY is created. */
  async function upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    const caller = resolveCaller(req);
    if (!caller) {
      logger.warn('terminal.upgrade.unauthenticated', {});
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    let containerId: string;
    try {
      containerId = await runner.ensureContainer(String(caller.user.id));
    } catch (err) {
      logger.error('terminal.upgrade.no_container', { userId: caller.user.id, error: String(err) });
      socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, containerId, caller.user.id);
    });
  }

  return { wss, upgrade, path: '/ws/terminal', idleSeconds: config.runner.idleSeconds };
}
