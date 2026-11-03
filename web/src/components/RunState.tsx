/**
 * Run state indicator.
 *
 * The backend caps concurrency and enforces a cool-down; both are invisible
 * unless the UI says so, and an unexplained pause reads as a broken button.
 * `starting` matters most — the first run after an idle reap creates a
 * container and does a cold cargo build, seconds rather than half a second.
 */
import type { Diagnosis } from '../lib/diagnostics/index.js';

export type RunPhase = 'idle' | 'cooling-down' | 'queued' | 'starting' | 'running' | 'done';

export function RunState({
  phase,
  seconds,
  elapsed = 0,
  timeoutSeconds,
  queuePosition,
  diagnosis,
}: {
  phase: RunPhase;
  seconds?: number;
  /** Seconds this run has been going. */
  elapsed?: number;
  /** When it will be stopped, so the student can see the deadline approaching. */
  timeoutSeconds?: number;
  /** Runs ahead of this one, when queued. */
  queuePosition?: number;
  /** How the finished run went; null for a run with nothing to say. */
  diagnosis?: Diagnosis | null;
}) {
  const label = {
    idle: '',
    'cooling-down': `Ready in ${seconds ?? 0}s`,
    queued: queuePosition ? `Waiting for a free slot… (${queuePosition} ahead)` : 'Waiting for a free slot…',
    starting: 'Starting your container…',
    // Counting UP to a stated limit rather than down to zero: a run that ends
    // in 1s should not first flash "119s remaining", which reads as a wait.
    running: timeoutSeconds ? `Running… ${elapsed}s / ${timeoutSeconds}s` : `Running… ${elapsed}s`,
    done: diagnosis?.title ?? '',
  }[phase];

  if (!label) return null;
  // Warn as the deadline nears, so a student watching the number knows the stop
  // is coming rather than being surprised by it.
  const nearingLimit =
    phase === 'running' && !!timeoutSeconds && elapsed >= timeoutSeconds * 0.75;
  const tone =
    phase === 'done'
      ? diagnosis?.tone === 'ok'
        ? 'var(--success)'
        : diagnosis?.tone === 'error'
          ? 'var(--danger)'
          : 'var(--warning)'
      : nearingLimit
        ? 'var(--warning)'
        : 'var(--text-muted)';
  return (
    <span style={{ color: tone, fontSize: '.85rem', fontVariantNumeric: 'tabular-nums' }}>
      {label}
    </span>
  );
}
