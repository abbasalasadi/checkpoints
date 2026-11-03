/**
 * Docker plumbing shared by the three backends: stream demultiplexing, a tiny
 * tar writer, and argv quoting.
 *
 * The demuxer replaces the Go reference's `chunk.subarray(8)`, which assumed one
 * frame per 'data' event. Under sustained output a frame splits across events
 * (and several frames share one), so that version dropped bytes and read
 * program output as headers. This one carries partial frames over.
 */

import { StringDecoder } from 'node:string_decoder';

/** If this much arrives without a parseable frame, treat the stream as unframed (a TTY). */
const FRAME_FALLBACK_BYTES = 64 * 1024;

/**
 * Incremental decoder for Docker's multiplexed attach/exec stream:
 * 8-byte header [stream, 0, 0, 0, len(u32 BE)] followed by `len` bytes.
 * stdout and stderr are merged, in arrival order, as the student would see them.
 */
export class DockerDemuxer {
  private pending: Buffer = Buffer.alloc(0);
  private readonly decoder = new StringDecoder('utf8');
  private framed: boolean | null = null;

  /** Feed raw bytes; returns the decoded text available so far (possibly ''). */
  push(chunk: Buffer): string {
    this.pending = this.pending.length === 0 ? chunk : Buffer.concat([this.pending, chunk]);

    // Decide once whether this stream is framed: a real header starts 0/1/2 then three zeros.
    if (this.framed === null && this.pending.length >= 4) {
      const p = this.pending;
      this.framed = p[0]! <= 2 && p[1] === 0 && p[2] === 0 && p[3] === 0;
    }
    if (this.framed === false) return this.takeRaw();
    if (this.framed === null) return '';

    const parts: Buffer[] = [];
    let offset = 0;
    while (offset + 8 <= this.pending.length) {
      const len = this.pending.readUInt32BE(offset + 4);
      if (offset + 8 + len > this.pending.length) break; // incomplete: wait for more
      parts.push(this.pending.subarray(offset + 8, offset + 8 + len));
      offset += 8 + len;
    }
    this.pending = offset === 0 ? this.pending : this.pending.subarray(offset);

    if (offset === 0 && this.pending.length > FRAME_FALLBACK_BYTES) {
      // A header claiming more than we will ever buffer: give up on framing.
      this.framed = false;
      return this.takeRaw();
    }
    return parts.length ? this.decoder.write(Buffer.concat(parts)) : '';
  }

  /** Flush whatever is left at end of stream. */
  end(): string {
    let out = '';
    if (this.pending.length && this.framed !== true) out += this.decoder.write(this.pending);
    this.pending = Buffer.alloc(0);
    return out + this.decoder.end();
  }

  private takeRaw(): string {
    const text = this.decoder.write(this.pending);
    this.pending = Buffer.alloc(0);
    return text;
  }
}

/**
 * Pipe a Docker stream through the demuxer into `onText`, resolving at end/close.
 * The listener is detached and the stream destroyed when `signal` aborts, so a
 * runaway program cannot keep growing a buffer after the job is over.
 */
export function pumpStream(
  stream: NodeJS.ReadableStream,
  onText: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve) => {
    const demux = new DockerDemuxer();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      stream.removeListener('data', onData);
      stream.removeListener('end', finish);
      stream.removeListener('close', finish);
      stream.removeListener('error', finish);
      signal?.removeEventListener('abort', onAbort);
      const tail = demux.end();
      if (tail) onText(tail);
      resolve();
    };
    const onData = (c: Buffer) => {
      if (done) return;
      const text = demux.push(c);
      if (text) onText(text);
    };
    const onAbort = () => {
      finish();
      (stream as unknown as { destroy?: () => void }).destroy?.();
    };
    stream.on('data', onData);
    stream.on('end', finish);
    stream.on('close', finish);
    stream.on('error', finish);
    if (signal?.aborted) onAbort();
    else signal?.addEventListener('abort', onAbort, { once: true });
  });
}

// ── tar ──────────────────────────────────────────────────────────────────────

/**
 * Minimal ustar writer (from the Rust reference). uid/gid fields are OCTAL, and
 * parent directories are emitted explicitly so Docker does not create them as root.
 */
function octal(value: number, width: number): string {
  return `${value.toString(8).padStart(width - 1, '0')}\0`;
}

function tarHeader(path: string, size: number, type: '0' | '5', mode: number, uid: number): Buffer {
  const header = Buffer.alloc(512);
  header.write(path.replace(/^\//, ''), 0, 100, 'utf8');
  header.write(octal(mode, 8), 100, 8, 'utf8');
  header.write(octal(uid, 8), 108, 8, 'utf8');
  header.write(octal(uid, 8), 116, 8, 'utf8');
  header.write(octal(size, 12), 124, 12, 'utf8');
  header.write(octal(Math.floor(Date.now() / 1000), 12), 136, 12, 'utf8');
  header.write('        ', 148, 8, 'utf8');
  header.write(type, 156, 1, 'utf8');
  header.write('ustar\0', 257, 6, 'utf8');
  header.write('00', 263, 2, 'utf8');
  let sum = 0;
  for (const b of header) sum += b;
  header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'utf8');
  return header;
}

export function buildTar(files: { path: string; content: string }[], uid = 10001): Buffer {
  const blocks: Buffer[] = [];
  const dirs = new Set<string>();
  for (const f of files) {
    const parts = f.path.replace(/^\//, '').split('/');
    parts.pop();
    let acc = '';
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part;
      dirs.add(acc);
    }
  }
  for (const d of [...dirs].sort((a, b) => a.split('/').length - b.split('/').length)) {
    blocks.push(tarHeader(`${d}/`, 0, '5', 0o755, uid));
  }
  for (const file of files) {
    const content = Buffer.from(file.content, 'utf8');
    blocks.push(tarHeader(file.path, content.length, '0', 0o644, uid));
    blocks.push(content);
    const pad = (512 - (content.length % 512)) % 512;
    if (pad) blocks.push(Buffer.alloc(pad));
  }
  blocks.push(Buffer.alloc(1024));
  return Buffer.concat(blocks);
}

/** Quote an argv for `sh -c`. */
export function shellQuote(argv: string[]): string {
  return argv.map((a) => `'${a.replace(/'/g, `'\\''`)}'`).join(' ');
}

/** True for a relative path with no `..` segment: safe to place under a run directory. */
export function safeRelativePath(p: string): boolean {
  if (!p || p.startsWith('/') || p.includes('\0') || p.includes('\\')) return false;
  return p.split('/').every((seg) => seg !== '' && seg !== '..' && seg !== '.');
}
