/**
 * Draggable splitter.
 *
 * Hand-rolled rather than pulling in a panel library: two dividers is not much
 * behaviour, and the project keeps third-party dependencies to what genuinely
 * earns its place.
 *
 * The details that matter and are easy to omit:
 *   - pointer capture, so a fast drag that leaves the 9px handle keeps working
 *   - a body-level flag during the drag, or the pointer selects text and the
 *     cursor flickers back to default over child elements
 *   - keyboard support, since a mouse-only control is unusable for some people
 *   - sizes persisted, so a layout tuned once survives a reload
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type Axis = 'x' | 'y';

interface SplitterProps {
  axis: Axis;
  /** Called with the pointer delta in pixels since the drag started. */
  onDelta: (delta: number) => void;
  onCommit?: () => void;
  label: string;
}

export function Splitter({ axis, onDelta, onCommit, label }: SplitterProps) {
  const [dragging, setDragging] = useState(false);
  const origin = useRef(0);

  const stop = useCallback(() => {
    setDragging(false);
    delete document.body.dataset.resizing;
    onCommit?.();
  }, [onCommit]);

  useEffect(() => () => { delete document.body.dataset.resizing; }, []);

  return (
    <div
      className="splitter"
      data-axis={axis}
      data-dragging={dragging || undefined}
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-label={label}
      tabIndex={0}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        origin.current = axis === 'x' ? e.clientX : e.clientY;
        document.body.dataset.resizing = axis;
        setDragging(true);
      }}
      onPointerMove={(e) => {
        if (!dragging) return;
        const now = axis === 'x' ? e.clientX : e.clientY;
        onDelta(now - origin.current);
        origin.current = now;
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => {
        const back = axis === 'x' ? 'ArrowLeft' : 'ArrowUp';
        const fwd = axis === 'x' ? 'ArrowRight' : 'ArrowDown';
        if (e.key !== back && e.key !== fwd) return;
        e.preventDefault();
        onDelta((e.key === back ? -1 : 1) * (e.shiftKey ? 48 : 12));
        onCommit?.();
      }}
    />
  );
}

/**
 * A pane size in pixels, clamped and remembered.
 *
 * Persisting means a student who widens the instructions once keeps that
 * layout; clamping means a drag to the edge cannot leave a pane unusable.
 */
export function usePaneSize(key: string, initial: number, min: number, max: number) {
  const [size, setSize] = useState(() => {
    const saved = Number(localStorage.getItem(`rc.layout.${key}`));
    return Number.isFinite(saved) && saved >= min ? Math.min(saved, max) : initial;
  });

  const nudge = useCallback(
    (delta: number) => setSize((s) => Math.max(min, Math.min(max, s + delta))),
    [min, max],
  );

  const persist = useCallback(() => {
    localStorage.setItem(`rc.layout.${key}`, String(size));
  }, [key, size]);

  return { size, nudge, persist };
}
