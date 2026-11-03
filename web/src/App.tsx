import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { markdownComponents } from './lib/markdown.js';
import { api, ApiFailure, type ExerciseDetail, type ExerciseSummary, type Placement, type SnapshotMeta } from './lib/api.js';
import { TerminalPane, type TerminalHandle } from './components/Terminal.js';
import { useConfirm } from './components/Dialog.js';
import { Splitter, usePaneSize } from './components/Split.js';
import { Menu } from './components/Menu.js';
import { Icon, Logo } from './components/Icon.js';
import { About } from './components/About.js';
import { StuckDialog } from './components/StuckDialog.js';
import { useToast } from './components/Toast.js';
import { RunState, type RunPhase } from './components/RunState.js';
import { RunNotice, noticeFor, type NoticeSpec } from './components/RunNotice.js';
import { diagnose } from './lib/diagnostics.js';
import { logger } from './logger.js';
import { navigate, onNavigate, slugFromLocation } from './lib/route.js';

type Screen = 'loading' | 'login' | 'app';

export function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [identifier, setIdentifier] = useState('');
  /**
   * Why the student is looking at the sign-in screen, when they did not ask to
   * be. Returning them here with no explanation reads as the app losing their
   * work; it has not, and the message says so.
   */
  const [signedOutReason, setSignedOutReason] = useState<string | null>(null);

  useEffect(() => {
    api
      .me()
      .then((r) => {
        setIdentifier(r.identifier);
        setScreen('app');
      })
      .catch(() => setScreen('login'));
  }, []);

  if (screen === 'loading') return <Centre>Loading…</Centre>;
  if (screen === 'login')
    return (
      <Login
        reason={signedOutReason}
        onSignedIn={(id) => {
          setIdentifier(id);
          setSignedOutReason(null);
          setScreen('app');
        }}
      />
    );
  return (
    <Workbench
      identifier={identifier}
      onSignedOut={(reason) => {
        setSignedOutReason(reason ?? null);
        setScreen('login');
      }}
    />
  );
}

// ── login ────────────────────────────────────────────────────────────────────

function Login({
  onSignedIn,
  reason,
}: {
  onSignedIn: (identifier: string) => void;
  /** Why they are here, when they did not choose to be. */
  reason?: string | null;
}) {
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.login(id, pw);
      onSignedIn(r.identifier);
    } catch (err) {
      // The backend returns one generic message regardless of which factor
      // failed; surfacing it verbatim preserves that anti-enumeration property.
      setError(err instanceof ApiFailure ? err.error.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Centre>
      <form onSubmit={submit} style={{ width: 'min(22rem, 90vw)', textAlign: 'center' }}>
        <div style={{ color: 'var(--accent-text)', display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
          <Logo size={76} />
        </div>
        <h1 style={{ fontSize: '1.5rem', marginTop: 0, marginBottom: '.3rem' }}>Rust Checkpoints</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 0, marginBottom: '1.5rem' }}>
          Sign in with your reboot01 account.
        </p>
        {/* The headings centre, but the fields do not: centred text jumping
            left as you type a username reads as a glitch. */}
        <input value={id} onChange={(e) => setId(e.target.value)} placeholder="reboot01 username" autoComplete="username" style={{ ...field, textAlign: 'left' }} />
        <input value={pw} onChange={(e) => setPw(e.target.value)} type="password" placeholder="Password" autoComplete="current-password" style={{ ...field, textAlign: 'left' }} />
        {reason && !error && (
          <p
            role="status"
            style={{
              color: 'var(--text-muted)',
              fontSize: '.85rem',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderLeft: '3px solid var(--warning)',
              borderRadius: 'var(--radius)',
              padding: '.55rem .7rem',
              margin: '0 0 .9rem',
              textAlign: 'left',
            }}
          >
            {reason}
          </p>
        )}
        {error && <p style={{ color: 'var(--danger)', fontSize: '.9rem' }}>{error}</p>}
        <button type="submit" disabled={busy || !id || !pw} style={{ ...field, ...primaryBtn(busy || !id || !pw) }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </Centre>
  );
}

// ── workbench ────────────────────────────────────────────────────────────────

function Workbench({
  identifier,
  onSignedOut,
}: {
  identifier: string;
  onSignedOut: (reason?: string) => void;
}) {
  const [list, setList] = useState<ExerciseSummary[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  // Seeded from the URL, so a refresh or a shared link opens the same exercise.
  const [slug, setSlug] = useState<string | null>(() => slugFromLocation());
  const [detail, setDetail] = useState<ExerciseDetail | null>(null);
  const [libRs, setLibRs] = useState('');
  const [mainRs, setMainRs] = useState('');
  const [tab, setTab] = useState<'lib' | 'main'>('lib');
  const [phase, setPhase] = useState<RunPhase>('idle');
  /**
   * Cool-down remaining per kind. Run and Test throttle on separate clocks
   * server-side, so one countdown cannot represent both: a shared one would
   * disable Test for the whole Run window and block the check-then-submit
   * rhythm the Run button exists to encourage.
   */
  const [cool, setCool] = useState<{ run: number; test: number }>({ run: 0, test: 0 });
  const [exitCode, setExitCode] = useState<number | undefined>();
  const [lastOutput, setLastOutput] = useState('');
  const [lastKind, setLastKind] = useState<'run' | 'test'>('test');
  const [args, setArgs] = useState('');
  // Both levels of the tree start collapsed. Nothing is auto-selected either —
  // landing on an exercise whose sidebar entry is hidden inside a closed group
  // is confusing.
  const [notice, setNotice] = useState<NoticeSpec | null>(null);
  const [cancelling, setCancelling] = useState(false);
  /** Seconds the current run has been going, and the limit it is counting to. */
  const [elapsed, setElapsed] = useState(0);
  const [timeoutSeconds, setTimeoutSeconds] = useState<number | undefined>();
  const [warnSeconds, setWarnSeconds] = useState<number | undefined>();
  /** Dismissed for THIS run, so the warning cannot nag every second. */
  const [stuckDismissed, setStuckDismissed] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [openLevels, setOpenLevels] = useState<Set<string>>(new Set());
  const term = useRef<TerminalHandle | null>(null);
  const { confirm, dialog } = useConfirm();
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'unsaved' | 'failed'>('saved');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [snaps, setSnaps] = useState<SnapshotMeta[]>([]);
  const { toast, showToast } = useToast();
  /**
   * What is pending, and which exercise it belongs to.
   *
   * The slug is captured here rather than read at save time: a debounced save
   * that fires after the student has switched exercises would otherwise write
   * one exercise's code into another's row.
   */
  const pending = useRef<{ slug: string; libRs: string; mainRs: string; kind: 'lib' | 'bin' } | null>(null);

  /** Write whatever is pending. Safe to call at any time; a no-op when clean. */
  /** Returns false if there was an edit that could not be saved. */
  const flush = useCallback(async () => {
    const p = pending.current;
    if (!p) return true;
    pending.current = null;
    setSaveState('saving');
    try {
      await api.save(p.slug, p.kind === 'lib' ? { libRs: p.libRs, mainRs: p.mainRs } : { mainRs: p.mainRs });
      setSaveState('saved');
      setSavedAt(new Date());
      return true;
    } catch (err) {
      // Put it back so the next attempt retries rather than losing the edit.
      pending.current = p;
      // 'failed' rather than 'unsaved': this one is shown, because the student
      // cannot otherwise know their work is at risk.
      setSaveState('failed');
      logger.warn('save.failed', { error: String(err) });
      return false;
    }
  }, []);

  /** Record an edit and mark it unsaved. The debounce below writes it. */
  const markDirty = useCallback(
    (next: { libRs?: string; mainRs?: string }) => {
      if (!detail) return;
      pending.current = {
        slug: detail.slug,
        kind: detail.kind,
        libRs: next.libRs ?? libRs,
        mainRs: next.mainRs ?? mainRs,
      };
      setSaveState('unsaved');
    },
    [detail, libRs, mainRs],
  );


  // Persisted so a layout tuned once survives a reload; clamped so no drag can
  // leave a pane unusable.
  const left = usePaneSize('left', 240, 160, 460);
  const right = usePaneSize('right', 620, 360, 1100);
  const results = usePaneSize('results', 240, 90, 640);

  useEffect(() => {
    void api.exercises().then((r) => {
      setList(r.exercises);
      setPlacements(r.placements);
      // A slug that is not a real exercise — mistyped or renamed — should not
      // leave a broken entry behind for Back to return to.
      const current = slugFromLocation();
      if (current && !r.exercises.some((e) => e.slug === current)) {
        setSlug(null);
        navigate(null, { replace: true });
      }
    });
  }, []);

  // Back and Forward move between exercises rather than out of the app.
  useEffect(() => onNavigate((next) => setSlug(next)), []);

  /**
   * Set when the tree itself picked the exercise: its branch is already open,
   * so auto-expanding would only fling open every other checkpoint sharing it.
   */
  const pickedFromTree = useRef(false);

  /** Selecting an exercise is a navigation, so it belongs in the history. */
  const select = useCallback((next: string) => {
    // Only a real change reloads; re-clicking the open exercise must not leave
    // the flag armed for a later Back.
    setSlug((prev) => {
      if (prev !== next) pickedFromTree.current = true;
      return next;
    });
    navigate(next);
  }, []);

  useEffect(() => {
    if (!slug) return;
    // Flush the exercise being left before loading the next, or a pending edit
    // would be dropped on the switch.
    void flush().then(() => api.exercise(slug)).then((d) => {
      setDetail(d);
      setLibRs(d.libRs ?? '');
      setMainRs(d.mainRs);
      setTab(d.kind === 'lib' ? 'lib' : 'main');
      setPhase('idle');
      setExitCode(undefined);
      setArgs('');
      pending.current = null;
      setSaveState('saved');
      void api.snapshots(slug).then((r) => setSnaps(r.snapshots)).catch(() => setSnaps([]));
      // Arriving by link, refresh or Back on a collapsed tree gives no clue where
      // the open exercise sits, so open its first branch — one, not every
      // checkpoint that reuses it. A click in the tree needs nothing opened.
      const first = d.placements[0];
      if (!pickedFromTree.current && first) {
        setOpenGroups((prev) => new Set([...prev, first.checkpoint]));
        setOpenLevels((prev) => new Set([...prev, `${first.checkpoint}/${first.level}`]));
      }
      pickedFromTree.current = false;
    });
    // flush is stable; re-running this on every keystroke would reload the file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // Cool-down countdown, so a disabled button always explains itself rather
  // than looking broken.
  // Autosave shortly after typing stops. Without this, work done between runs
  // is lost if the tab closes — the only saves were on Run and Submit.
  useEffect(() => {
    if (saveState !== 'unsaved') return;
    const id = setTimeout(() => void flush(), 1200);
    return () => clearTimeout(id);
  }, [saveState, libRs, mainRs, flush]);

  // Leaving the page is the case autosave cannot cover with a timer.
  useEffect(() => {
    const onHide = () => {
      if (pending.current) void flush();
    };
    window.addEventListener('beforeunload', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('beforeunload', onHide);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [flush]);

  useEffect(() => {
    if (cool.run <= 0 && cool.test <= 0) return;
    const t = setTimeout(
      () => setCool((c) => ({ run: Math.max(0, c.run - 1), test: Math.max(0, c.test - 1) })),
      1000,
    );
    return () => clearTimeout(t);
  }, [cool]);

  // Fetched once at mount, not on the first poll: otherwise the very first run
  // shows "Running… 3s" with no limit until a poll lands, and the limit
  // appearing mid-run looks like it changed.
  useEffect(() => {
    void api
      .runnerState()
      .then((s) => {
        setTimeoutSeconds(s.timeoutSeconds);
        setWarnSeconds(s.warnSeconds);
      })
      .catch(() => undefined);
  }, []);

  // One tick per second while a run is in flight. Reset happens at the start of
  // execute(), not here, so a queued run counts from when it was submitted.
  useEffect(() => {
    if (phase !== 'running' && phase !== 'queued' && phase !== 'starting') return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  /**
   * While a run is in flight, ask whether it is actually executing or just
   * waiting for a free slot.
   *
   * The POST blocks server-side until a slot frees, so without this the UI says
   * "Running…" when nothing of the student's is running — and at capacity, that
   * silence is precisely when they need to be told why.
   */
  useEffect(() => {
    if (phase !== 'running' && phase !== 'queued') return;
    let live = true;
    const id = setInterval(() => {
      void api
        .runnerState()
        .then((s) => {
          if (!live) return;
          setTimeoutSeconds(s.timeoutSeconds);
          // Only ever moves between these two: never override 'done' or an
          // error state that landed while the poll was in flight.
          setPhase((p) => (p === 'running' || p === 'queued' ? (s.queued ? 'queued' : 'running') : p));
        })
        .catch(() => undefined);
    }, 1500);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [phase]);

  const grouped = useMemo(() => {
    const byCheckpoint = new Map<string, Map<number, string[]>>();
    for (const p of placements) {
      const levels = byCheckpoint.get(p.checkpoint) ?? new Map<number, string[]>();
      const slugs = levels.get(p.level) ?? [];
      slugs.push(p.exercise);
      levels.set(p.level, slugs);
      byCheckpoint.set(p.checkpoint, levels);
    }
    return byCheckpoint;
  }, [placements]);

  const passed = useMemo(() => new Set(list.filter((e) => e.passed).map((e) => e.slug)), [list]);

  const toggle = (set: (fn: (prev: Set<string>) => Set<string>) => void, key: string) =>
    set((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  async function execute(kind: 'run' | 'test') {
    if (!detail) return;
    // The runner executes the SAVED code. If the save did not land, running
    // anyway would grade the previous version and report the result as though
    // it were this one — worse than not running at all.
    if (!(await flush())) {
      setNotice({
        tone: 'error',
        title: 'Your latest changes could not be saved, so the run was stopped.',
        detail: 'Check your connection and try again — the run would have used your previous code.',
      });
      return;
    }
    setExitCode(undefined);
    setLastOutput('');
    setLastKind(kind);
    setNotice(null);
    setCancelling(false);
    setElapsed(0);
    setStuckDismissed(false);
    setPhase('starting');
    // Clear first: the previous result must not be mistaken for this one, and
    // scrolling back through old output to find the current failure is worse
    // than losing it. Safe to do before the request because the buttons are
    // disabled during the cool-down, so this call will not be refused.
    term.current?.clear();
    const shown =
      kind === 'test' ? 'cargo test' : `cargo run${args.trim() ? ` -- ${args.trim()}` : ''}`;
    term.current?.write(`\x1b[36m$ ${shown}\x1b[0m\r\n`);
    try {
      setPhase('running');
      const res = kind === 'test' ? await api.test(detail.slug) : await api.run(detail.slug, splitArgs(args));
      term.current?.write(res.output.replace(/\n/g, '\r\n'));

      // A hint under the output, dimmed and prefixed so it is never mistaken
      // for something cargo said.
      const d = diagnose(kind, res.exitCode, res.output);
      if (d.hint && res.outcome === 'ok') {
        term.current?.write(`\r\n\x1b[2m── ${d.title}: ${d.hint}\x1b[0m\r\n`);
      }

      setNotice(
        noticeFor(res.outcome, {
          timeoutSeconds: res.timeoutSeconds,
          argsTruncated: res.argsTruncated,
          maxArgs: res.maxArgs,
          emptyOutput: res.exitCode === 0 && res.output.trim() === '',
          kind,
        }),
      );
      // A run that was stopped has no meaningful exit code, and showing one
      // would send diagnose() looking for a compile error that never happened.
      const stopped =
        res.outcome === 'timeout' || res.outcome === 'cancelled' || res.outcome === 'out_of_memory';
      if (stopped) {
        term.current?.write(
          `\r\n\x1b[33m[${res.outcome === 'cancelled' ? 'cancelled' : 'stopped'}]\x1b[0m\r\n`,
        );
      }
      setLastOutput(res.output);
      setExitCode(stopped ? undefined : res.exitCode);
      setPhase('done');
      // Start the cool-down now, so the buttons disable before the student can
      // press again and be refused.
      setCool((c) => ({ ...c, [kind]: res.cooldownSeconds }));
      if (kind === 'test' && res.passed) {
        setList((prev) => prev.map((e) => (e.slug === detail.slug ? { ...e, passed: true } : e)));
        // Submit stores the passing code; pick the new snapshot up so it can be
        // restored without a reload.
        void api.snapshots(detail.slug).then((r) => setSnaps(r.snapshots)).catch(() => undefined);
      }
    } catch (err) {
      if (err instanceof ApiFailure && err.error.code === 'cooling_down') {
        // Reachable from a second tab, where this tab's countdown is unaware of
        // the other's run.
        const wait = err.error.secondsRemaining ?? 5;
        setCool((c) => ({ ...c, [kind]: wait }));
        setPhase('cooling-down');
        term.current?.write(`\r\n\x1b[33m[waiting ${wait}s before the next ${kind}]\x1b[0m\r\n`);
        return;
      }
      if (err instanceof ApiFailure && err.status === 401) {
        // Expired mid-session. The reason travels to the sign-in screen, since
        // this component is about to unmount and any notice with it.
        setPhase('idle');
        onSignedOut('Your session expired. Sign in again — your saved work is safe.');
        return;
      }
      if (err instanceof ApiFailure && err.error.code === 'runner_unavailable') {
        term.current?.write(`\r\n\x1b[31m${err.error.message}\x1b[0m\r\n`);
        setNotice(noticeFor('runner_error'));
        setPhase('idle');
        return;
      }
      logger.error('run.failed', { error: String(err) });
      setPhase('idle');
    }
  }

  /**
   * Stop the run in flight.
   *
   * The in-flight POST is deliberately left alone rather than aborted: the
   * server answers it with outcome 'cancelled' plus whatever the program
   * printed before it died, which is more useful than a dropped request.
   */
  async function cancelRun() {
    if (!running) return;
    setCancelling(true);
    try {
      await api.cancelRun();
    } catch (err) {
      // Losing the race — the run finished first — is not worth reporting.
      logger.error('cancel.failed', { error: String(err) });
      setCancelling(false);
    }
  }

  async function signOut() {
    const ok = await confirm({
      title: 'Sign out?',
      body: 'Your saved code stays on the server — you can sign back in and pick up where you left off.',
      confirmLabel: 'Sign out',
    });
    if (!ok) return;
    // Revoke the session even if the request fails, so the browser does not
    // keep showing a signed-in UI backed by a dead cookie.
    await api.logout().catch(() => undefined);
    onSignedOut();
  }

  async function saveCopy() {
    if (!detail) return;
    await flush();
    try {
      await api.saveSnapshot(detail.slug);
      const r = await api.snapshots(detail.slug);
      setSnaps(r.snapshots);
      showToast('Copy saved');
    } catch (err) {
      showToast(err instanceof ApiFailure ? err.error.message : 'Could not save a copy');
    }
  }

  async function restore(id: number, label: string) {
    if (!detail) return;
    // Drop the pending edit, or the autosave would write the old code back over
    // what was just restored.
    pending.current = null;
    const r = await api.restoreSnapshot(detail.slug, id);
    setLibRs(r.libRs ?? '');
    setMainRs(r.mainRs);
    setSaveState('saved');
    showToast(`Restored ${label}`);
  }

  async function resetExercise() {
    if (!detail) return;
    const ok = await confirm({
      title: 'Reset this exercise?',
      body: 'Your saved code for this exercise is replaced with the starting stub. This cannot be undone.',
      confirmLabel: 'Reset',
      destructive: true,
    });
    if (!ok) return;
    // Drop the pending edit first, or the autosave would write the old code
    // straight back over the reset.
    pending.current = null;
    await api.reset(detail.slug);
    const d = await api.exercise(detail.slug);
    setLibRs(d.libRs ?? '');
    setMainRs(d.mainRs);
    setSaveState('saved');
    showToast('Restored the starting stub');
  }

  const running = phase === 'running' || phase === 'starting' || phase === 'queued';
  // A run inside the cool-down is refused server-side, so do not offer it.
  const cooling = cool.run > 0 || cool.test > 0;
  // Only `running` blocks both buttons; each kind's own cool-down blocks only it.
  const busy = running;
  const blocked = { run: running || cool.run > 0, test: running || cool.test > 0 };
  const passingSnap = snaps.find((s) => s.kind === 'passing');
  const manualSnaps = snaps.filter((s) => s.kind === 'manual');
  const tabs = detail?.kind === 'lib' ? (['lib', 'main'] as const) : (['main'] as const);

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      {/* ── left: exercise tree ─────────────────────────────────────────── */}
      <aside
        style={{
          width: left.size,
          flex: '0 0 auto',
          borderRight: '1px solid var(--border)',
          overflowY: 'auto',
          padding: '.6rem',
          minWidth: 0,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.6rem' }}>
          <strong style={{ fontSize: '.85rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>{identifier}</strong>
          <button type="button" onClick={() => void signOut()} style={{ ...ghostBtn, fontSize: '.75rem' }}>
            Sign out
          </button>
        </div>

        {[...grouped.entries()].map(([checkpoint, levels]) => {
          const inGroup = [...levels.values()].flat();
          const groupDone = inGroup.filter((s) => passed.has(s)).length;
          const groupOpen = openGroups.has(checkpoint);
          return (
            <div key={checkpoint} style={{ marginBottom: '.3rem' }}>
              <button
                type="button"
                aria-expanded={groupOpen}
                onClick={() => toggle(setOpenGroups, checkpoint)}
                style={treeRow('var(--text)', '.8rem')}
              >
                <Caret open={groupOpen} />
                <span style={{ flex: 1 }}>Checkpoint {checkpoint}</span>
                <Count done={groupDone} total={inGroup.length} />
              </button>

              {groupOpen &&
                [...levels.entries()]
                  .sort((a, b) => a[0] - b[0])
                  .map(([level, slugs]) => {
                    const levelKey = `${checkpoint}/${level}`;
                    const levelOpen = openLevels.has(levelKey);
                    const levelDone = slugs.filter((s) => passed.has(s)).length;
                    return (
                      <div key={levelKey} style={{ paddingLeft: '.85rem' }}>
                        <button
                          type="button"
                          aria-expanded={levelOpen}
                          onClick={() => toggle(setOpenLevels, levelKey)}
                          style={treeRow('var(--text-muted)', '.76rem')}
                        >
                          <Caret open={levelOpen} />
                          <span style={{ flex: 1 }}>Level {level}</span>
                          <Count done={levelDone} total={slugs.length} />
                        </button>

                        {levelOpen &&
                          slugs.map((s) => (
                            <button
                              key={`${levelKey}/${s}`}
                              type="button"
                              onClick={() => select(s)}
                              style={{
                                ...ghostBtn,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '.35rem',
                                width: '100%',
                                textAlign: 'left',
                                color: slug === s ? 'var(--accent-text)' : 'var(--text-muted)',
                                fontSize: '.82rem',
                                padding: '.15rem .3rem .15rem 1.15rem',
                                overflow: 'hidden',
                              }}
                            >
                              {/* Reserved whether or not it is filled, so a row
                                  does not shift sideways once it starts passing. */}
                              <span style={{ width: 12, flex: 'none', color: 'var(--success)' }}>
                                {passed.has(s) && <Icon name="check" size={12} />}
                              </span>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{s}</span>
                            </button>
                          ))}
                      </div>
                    );
                  })}
            </div>
          );
        })}
      </aside>

      <Splitter axis="x" label="Resize the exercise list" onDelta={left.nudge} onCommit={left.persist} />

      {/* ── centre: instructions ─────────────────────────────────────────
        * No title bar: every README opens with the exercise's own heading, so a
        * separate one would repeat it. Progress and placement are already in the
        * sidebar — the checkmark and the tree position say both.
        */}
      <section style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div className="markdown" style={{ flex: '1 1 0', overflowY: 'auto', padding: '1.1rem 1.3rem' }}>
          {detail ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {detail.readme}
            </ReactMarkdown>
          ) : (
            <p style={{ color: 'var(--text-dim)' }}>Choose an exercise from the list to begin.</p>
          )}
        </div>
      </section>

      <Splitter axis="x" label="Resize the instructions" onDelta={(d) => right.nudge(-d)} onCommit={right.persist} />

      {/* ── right: editor, arguments, actions, results ──────────────────── */}
      <section
        style={{
          width: right.size,
          flex: '0 0 auto',
          display: 'flex',
          flexDirection: 'column',
          borderLeft: '1px solid var(--border)',
          minWidth: 0,
          position: 'relative',
        }}
      >
        {/* A. file buttons */}
        <div style={{ display: 'flex', gap: '.3rem', padding: '.45rem .6rem', borderBottom: '1px solid var(--border)', flex: '0 0 auto' }}>
          {tabs.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setTab(f)}
              style={{
                ...ghostBtn,
                fontSize: '.8rem',
                color: tab === f ? 'var(--accent-text)' : 'var(--text-muted)',
                borderBottom: tab === f ? '2px solid var(--accent)' : '2px solid transparent',
                borderRadius: 0,
              }}
            >
              {f === 'lib' ? 'lib.rs' : 'main.rs'}
            </button>
          ))}

          {/* Autosave says nothing when it works — the student did not ask for
              it and cannot act on it. A FAILED save is shown, and stays shown,
              because it means their work is at risk. */}
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '.6rem' }}>
            {saveState === 'failed' && (
              <span style={{ color: 'var(--warning)', fontSize: '.76rem' }} role="status">
                Not saved — retrying
              </span>
            )}
            <Menu
              note={savedAt ? `Saved ${timeAgo(savedAt)}` : undefined}
              /* Per-item rather than a `disabled` menu, so About stays
                 reachable before any exercise has been opened. The menu drops
                 disabled items, so with none loaded only About remains. */
              groups={[
                [{ label: 'Save a copy', onSelect: () => void saveCopy(), disabled: !detail }],
                [
                  { label: 'Restore starting stub', onSelect: () => void resetExercise(), destructive: true, disabled: !detail },
                  ...(passingSnap
                    ? [{ label: 'Restore last passing', onSelect: () => void restore(passingSnap.id, 'the last passing version') }]
                    : []),
                  ...manualSnaps.map((s, i) => ({
                    label: `Restore saved copy${manualSnaps.length > 1 ? ` (${i === 0 ? 'newest' : timeAgo(new Date(s.createdAt))})` : ''}`,
                    onSelect: () => void restore(s.id, 'your saved copy'),
                  })),
                ],
                [{ label: 'About', onSelect: () => setAboutOpen(true) }],
              ]}
            />
          </span>
        </div>

        {/* B. editor */}
        <div style={{ flex: '1 1 0', minHeight: 0 }}>
          <Editor
            height="100%"
            /* Monaco's built-in vs-dark sits at #1e1e1e, several stops lighter
               than the shell, which made the editor look like a pasted-in panel.
               This is vs-dark with the surfaces swapped for the theme tokens;
               Monaco cannot read CSS variables, so the values are literals. */
            beforeMount={defineEditorTheme}
            theme="rust-checkpoints"
            language="rust"
            path={`${detail?.slug ?? 'none'}/${tab}`}
            value={tab === 'lib' ? libRs : mainRs}
            onChange={(v) => {
              const value = v ?? '';
              if (tab === 'lib') {
                setLibRs(value);
                markDirty({ libRs: value });
              } else {
                setMainRs(value);
                markDirty({ mainRs: value });
              }
            }}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              scrollBeyondLastLine: false,
              automaticLayout: true,
              padding: { top: 8 },
            }}
          />
        </div>

        {/* C. arguments — only where the exercise reads argv */}
        {detail?.argv && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.45rem .6rem', borderTop: '1px solid var(--border)', flex: '0 0 auto' }}>
            <label htmlFor="args" style={{ color: 'var(--text-muted)', fontSize: '.78rem', flex: '0 0 auto' }}>
              Arguments
            </label>
            <input
              id="args"
              value={args}
              onChange={(e) => setArgs(e.target.value)}
              placeholder='e.g. "1 2 * 3 * 4 +"'
              style={{
                flex: '1 1 auto', minWidth: 0, background: 'var(--surface)', color: 'var(--text)',
                border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', padding: '.3rem .5rem',
                font: 'inherit', fontSize: '.82rem',
              }}
            />
          </div>
        )}

        {/* D. actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.5rem .6rem', borderTop: '1px solid var(--border)', flex: '0 0 auto' }}>
          {/* Cancel REPLACES Run and Submit while a run is in flight, rather
              than sitting beside them: three controls where only one is usable
              is three chances to click the wrong one. */}
          {running ? (
            <button
              type="button"
              onClick={() => void cancelRun()}
              disabled={cancelling}
              style={cancelBtn(cancelling)}
            >
              <Icon name="stop" size={12} />
              {cancelling ? 'Stopping…' : 'Cancel'}
            </button>
          ) : (
            <>
              <button type="button" onClick={() => void execute('run')} disabled={blocked.run || !detail} style={actionBtn(blocked.run || !detail)}>
                <Icon name="play" size={12} />
                Run
              </button>
              <button type="button" onClick={() => void execute('test')} disabled={blocked.test || !detail} style={actionBtn(blocked.test || !detail)}>
                <Icon name="submit" size={13} />
                Submit
              </button>
            </>
          )}
          {cooling && (
            <span style={{ color: 'var(--text-muted)', fontSize: '.8rem', fontVariantNumeric: 'tabular-nums' }}>
              {[
                cool.run > 0 ? `Run ready in ${fmtWait(cool.run)}` : null,
                cool.test > 0 ? `Test ready in ${fmtWait(cool.test)}` : null,
              ].filter(Boolean).join(' · ')}
            </span>
          )}

          <span style={{ marginLeft: 'auto' }}>
            <RunState
              phase={phase}
              seconds={cool[lastKind]}
              elapsed={elapsed}
              timeoutSeconds={timeoutSeconds}
              exitCode={exitCode}
              output={lastOutput}
              kind={lastKind}
            />
          </span>
        </div>

        <Splitter axis="y" label="Resize the results" onDelta={(d) => results.nudge(-d)} onCommit={results.persist} />

        {toast}

        {/* E. results */}
        <RunNotice notice={notice} />
        <div style={{ height: results.size, flex: '0 0 auto', borderTop: '1px solid var(--border)', minHeight: 0 }}>
          <TerminalPane onReady={(h) => (term.current = h)} />
        </div>
      </section>

      {dialog}
      <About open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <StuckDialog
        open={
          running &&
          !cancelling &&
          !stuckDismissed &&
          warnSeconds !== undefined &&
          elapsed >= warnSeconds
        }
        elapsed={elapsed}
        timeoutSeconds={timeoutSeconds ?? 60}
        onKeepWaiting={() => setStuckDismissed(true)}
        onCancel={() => {
          setStuckDismissed(true);
          void cancelRun();
        }}
      />
    </div>
  );
}

/**
 * Split an argument string the way a shell would, honouring quotes.
 *
 * brackets_matching takes a variable number of quoted arguments, so naive
 * whitespace splitting would mangle `'(a b)' '[c]'` into four.
 */
function splitArgs(input: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    out.push(m[1] ?? m[2] ?? m[3] ?? '');
  }
  return out.slice(0, 16);
}

/** "2 minutes ago", for the passive line at the top of the menu. */
function timeAgo(when: Date): string {
  const seconds = Math.max(0, Math.round((Date.now() - when.getTime()) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'} ago`;
}

// ── sidebar tree ─────────────────────────────────────────────────────────────

function Caret({ open }: { open: boolean }) {
  return (
    <span style={{ display: 'flex', width: '.75rem', color: 'var(--text-dim)' }}>
      <Icon name="caret" size={11} rotate={open ? 90 : 0} />
    </span>
  );
}

/**
 * Progress on a branch, so collapsing it does not hide what has been done.
 *
 * Counts exercises PASSED, not the one selected — selecting changes nothing
 * here, and nothing should, because a count tied to selection would mean
 * nothing.
 *
 * The total is always shown, since it says how many exercises a collapsed
 * branch holds. Only the "0/" prefix is dropped: before the first pass it
 * carried no information and never moved.
 */
function Count({ done, total }: { done: number; total: number }) {
  if (total === 0) return null;
  const complete = done === total;
  const label = done === 0 ? `${total} exercises, none passed yet` : `${done} of ${total} passed`;
  return (
    <span
      title={label}
      aria-label={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '.2rem',
        color: complete ? 'var(--success)' : done > 0 ? 'var(--text-muted)' : 'var(--text-dim)',
        fontSize: '.72rem',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {complete && <Icon name="check" size={11} />}
      {complete ? total : done > 0 ? `${done}/${total}` : total}
    </span>
  );
}

function treeRow(color: string, fontSize: string): React.CSSProperties {
  return {
    ...ghostBtn,
    display: 'flex',
    alignItems: 'center',
    gap: '.4rem',
    width: '100%',
    textAlign: 'left',
    color,
    fontSize,
    padding: '.25rem .2rem',
  };
}

// ── bits ─────────────────────────────────────────────────────────────────────

function Centre({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'system-ui, sans-serif' }}>
      {children}
    </div>
  );
}

const field: React.CSSProperties = {
  display: 'block', width: '100%', boxSizing: 'border-box', marginBottom: '.6rem',
  padding: '.55rem .7rem', borderRadius: 'var(--radius)', border: '1px solid var(--border-strong)',
  background: 'var(--surface)', color: 'var(--text)', font: 'inherit',
};
/**
 * A wait, in the units a person would use. The Test window is three minutes, and
 * "ready in 173s" makes a student do arithmetic to learn something they can feel.
 */
function fmtWait(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    background: disabled ? 'var(--disabled-bg)' : 'var(--accent)',
    borderColor: disabled ? 'var(--border-strong)' : 'var(--accent)',
    color: disabled ? 'var(--disabled-text)' : '#fff',
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}
/** Primary action. Greys out when disabled, so it does not invite a dead click. */
/** Registered once, before the first editor mounts. */
function defineEditorTheme(monaco: typeof import('monaco-editor')): void {
  monaco.editor.defineTheme('rust-checkpoints', {
    base: 'vs-dark',
    inherit: true, // keep vs-dark's Rust token colours; only surfaces change
    rules: [],
    colors: {
      'editor.background': '#0b0d12', // --surface
      'editorGutter.background': '#0b0d12',
      'editor.lineHighlightBackground': '#101318', // --raised
      'editorLineNumber.foreground': '#4b5568',
      'editorLineNumber.activeForeground': '#94a3b8', // --text-muted
      'editorIndentGuide.background1': '#1e232c', // --border
      'editorIndentGuide.activeBackground1': '#2a313d', // --border-strong
      'editorWidget.background': '#101318',
      'editorWidget.border': '#2a313d',
      'editor.selectionBackground': '#264a80',
      'scrollbarSlider.background': '#2a313d80',
      'scrollbarSlider.hoverBackground': '#3a4356b0',
    },
  });
}

/** Cancel is an outline, not a filled red: it stops work, it does not destroy it. */
function cancelBtn(disabled: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '.4rem',
    background: 'transparent',
    color: disabled ? 'var(--disabled-text)' : 'var(--danger)',
    border: `1px solid ${disabled ? 'var(--border)' : 'var(--danger)'}`,
    borderRadius: 'var(--radius)',
    padding: '.35rem .8rem',
    cursor: disabled ? 'not-allowed' : 'pointer',
    font: 'inherit',
    fontSize: '.85rem',
  };
}

function actionBtn(disabled: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '.4rem',
    background: disabled ? 'var(--disabled-bg)' : 'var(--accent)',
    color: disabled ? 'var(--disabled-text)' : '#fff',
    border: 'none',
    borderRadius: 'var(--radius)',
    padding: '.35rem .8rem',
    cursor: disabled ? 'not-allowed' : 'pointer',
    font: 'inherit',
    fontSize: '.85rem',
  };
}

/** Secondary control. Bordered so it does not read as a label. */
function outlineBtn(disabled: boolean): React.CSSProperties {
  return {
    background: 'transparent',
    color: disabled ? 'var(--disabled-text)' : 'var(--text)',
    border: `1px solid ${disabled ? 'var(--border)' : 'var(--border-strong)'}`,
    borderRadius: 6,
    padding: '.18rem .7rem',
    cursor: disabled ? 'not-allowed' : 'pointer',
    font: 'inherit',
    fontSize: '.78rem',
  };
}
const ghostBtn: React.CSSProperties = {
  background: 'transparent', color: 'var(--text)', border: 'none',
  cursor: 'pointer', font: 'inherit', fontSize: '.85rem', padding: '.25rem .4rem',
};
