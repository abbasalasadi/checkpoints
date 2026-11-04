import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { markdownComponents } from './lib/markdown.js';
import {
  api,
  ApiFailure,
  filesOf,
  reportUrl,
  runSocketUrl,
  type ExerciseDetail,
  type ExerciseSummary,
  type Language,
  type Placement,
  type RunMessage,
  type RunnerState,
  type SnapshotMeta,
  type ExamView,
} from './lib/api.js';
import { TerminalPane, type TerminalHandle } from './components/Terminal.js';
import { useConfirm } from './components/Dialog.js';
import { Splitter, usePaneSize } from './components/Split.js';
import { Menu } from './components/Menu.js';
import { Icon, Logo } from './components/Icon.js';
import { About } from './components/About.js';
import { Exams, STATUS_LABEL } from './components/Exams.js';
import { Settings } from './components/Settings.js';
import { usePreferences, type Preferences } from './lib/preferences.js';
import { StuckDialog } from './components/StuckDialog.js';
import { useToast } from './components/Toast.js';
import { RunState, type RunPhase } from './components/RunState.js';
import { RunNotice, noticeFor, type NoticeSpec } from './components/RunNotice.js';
import { canonicalOutcome, diagnoseRun, noticeOutcome, type Diagnosis } from './lib/diagnostics/index.js';
import { lint as lintGo } from './lib/lint/go.js';
import { lintForSubmit as lintJs } from './lib/lint/js.js';
import { logger } from './logger.js';
import { COMPACT_QUERY, SYMBOLS, useMedia } from './lib/media.js';
import { clearAllDrafts, clearDraft, draftDiffers, readDraft, saveDraft, useOnline } from './lib/offline.js';
import { isLanguage, navigate, navigatePage, onNavigate, readLocation, type Page } from './lib/route.js';
import { Dashboard } from './components/Dashboard.js';
import { History } from './components/History.js';
import { Vault } from './components/Vault.js';
import { Skeleton } from './components/Skeleton.js';
import { PageHeader } from './components/PageHeader.js';

type Screen = 'loading' | 'login' | 'app';

/** Autosave fires this long after typing stops. */
export const AUTOSAVE_MS = 900;

const LANGUAGE_LABEL: Record<Language, string> = { go: 'Go', js: 'JavaScript', rust: 'Rust' };
const LAST_LANGUAGE_KEY = 'cp.language';

function lastLanguage(): Language {
  try {
    const v = localStorage.getItem(LAST_LANGUAGE_KEY);
    if (isLanguage(v)) return v;
  } catch {
    /* storage unavailable */
  }
  return 'rust';
}
function rememberLanguage(lang: Language): void {
  try {
    localStorage.setItem(LAST_LANGUAGE_KEY, lang);
  } catch {
    /* storage unavailable */
  }
}

/** Monaco's language id for a file, falling back to the track's. */
export function editorLanguage(file: string, track: Language): string {
  if (file.endsWith('.go')) return 'go';
  if (/\.(m|c)?js$/.test(file)) return 'javascript';
  if (file.endsWith('.rs')) return 'rust';
  if (file.endsWith('.json')) return 'json';
  if (file.endsWith('.toml') || file.endsWith('.mod')) return 'plaintext';
  return track === 'js' ? 'javascript' : track;
}

/** The command line echoed before a run, so the student sees what ran. */
function shownCommand(lang: Language, kind: 'run' | 'test', args: string, files: string[]): string {
  const a = args.trim() ? ` ${args.trim()}` : '';
  if (lang === 'rust') return kind === 'test' ? 'cargo test' : `cargo run${a ? ` --${a}` : ''}`;
  if (lang === 'go') return kind === 'test' ? 'go test' : `go run .${a}`;
  const entry = files.includes('main.js') ? 'main.js' : (files[0] ?? 'main.js');
  return kind === 'test' ? 'node test' : `node ${entry}${a}`;
}

const nameOf = (r: { identifier?: string; login?: string }) => r.identifier ?? r.login ?? '';

export function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [identifier, setIdentifier] = useState('');
  /**
   * Why the student is looking at the sign-in screen, when they did not ask to
   * be. Returning them here with no explanation reads as the app losing their
   * work; it has not, and the message says so.
   */
  const [signedOutReason, setSignedOutReason] = useState<string | null>(null);
  const { prefs, update: updatePrefs } = usePreferences(screen === 'app');

  useEffect(() => {
    api
      .me()
      .then((r) => {
        setIdentifier(nameOf(r));
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
  const signedOut = (reason?: string) => {
    setSignedOutReason(reason ?? null);
    setScreen('login');
  };
  return (
    <>
      <OfflineBanner />
      <SignedIn identifier={identifier} prefs={prefs} onPrefs={updatePrefs} onSignedOut={signedOut} />
    </>
  );
}

/** V2: says so when the connection drops; edits are kept and sent on return. */
function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="status"
      style={{
        position: 'fixed', left: '50%', bottom: '1rem', transform: 'translateX(-50%)', zIndex: 50,
        background: 'var(--raised)', color: 'var(--text)', border: '1px solid var(--warning, #eab308)', borderRadius: 'var(--radius)',
        padding: '.45rem .9rem', fontSize: '.82rem', boxShadow: '0 4px 16px rgba(0,0,0,.4)',
      }}
    >
      You are offline. Edits are kept in this browser and saved when the connection returns; Run and Submit wait.
    </div>
  );
}

/**
 * The signed-in app: the dashboard and history pages (V2), or the workbench
 * for a track. Which one comes from the URL, so Back and Forward move between
 * them.
 */
function SignedIn({
  identifier,
  prefs,
  onPrefs,
  onSignedOut,
}: {
  identifier: string;
  prefs: Preferences;
  onPrefs: (patch: Partial<Preferences>) => void;
  onSignedOut: (reason?: string) => void;
}) {
  const [loc, setLoc] = useState(() => readLocation());
  const [historyFocus, setHistoryFocus] = useState<{ language: Language; slug: string } | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  /** The running mock exam: it takes over the whole app until it ends (D28). */
  const [exam, setExam] = useState<ExamView | null>(null);
  const [examFocus, setExamFocus] = useState<number | null>(null);
  const { confirm, dialog } = useConfirm();
  useEffect(() => onNavigate(setLoc), []);
  // A refresh during an exam returns to it.
  useEffect(() => {
    void api
      .exams()
      .then((r) => r.active && enterExam(r.active))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goPage = (page: Page) => {
    navigatePage(page);
    setLoc(readLocation());
  };
  const openTrack = (language: Language, slug: string | null) => {
    rememberLanguage(language);
    navigate(language, slug);
    setLoc(readLocation());
  };

  function enterExam(e: ExamView) {
    const first = e.items[0]?.slug ?? null;
    navigate(e.language, first, { replace: true });
    setLoc(readLocation());
    setExam(e);
  }

  if (exam) {
    return (
      <Workbench
        key={`exam-${exam.id}`}
        identifier={identifier}
        prefs={prefs}
        onPrefs={onPrefs}
        onSignedOut={onSignedOut}
        onDashboard={() => goPage('exams')}
        exam={exam}
        onExamEnded={(id) => {
          setExam(null);
          setExamFocus(id);
          goPage('exams');
        }}
      />
    );
  }

  if (!loc.page && loc.language) {
    return (
      <Workbench
        key="workbench"
        identifier={identifier}
        prefs={prefs}
        onPrefs={onPrefs}
        onSignedOut={onSignedOut}
        onDashboard={() => goPage('dashboard')}
      />
    );
  }

  async function signOut() {
    const ok = await confirm({
      title: 'Sign out?',
      body: 'Your saved code stays on the server — you can sign back in and pick up where you left off.',
      confirmLabel: 'Sign out',
    });
    if (!ok) return;
    await api.logout().catch(() => undefined);
    clearAllDrafts();
    onSignedOut();
  }

  const page = loc.page ?? 'dashboard';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        identifier={identifier}
        current={page}
        onDashboard={() => goPage('dashboard')}
        onHistory={() => {
          setHistoryFocus(null);
          goPage('history');
        }}
        onVault={() => goPage('vault')}
        onExams={() => goPage('exams')}
        onAbout={() => setAboutOpen(true)}
        onSignOut={() => void signOut()}
      />
      <About open={aboutOpen} onClose={() => setAboutOpen(false)} />
      {page === 'history' ? (
        <History key={historyFocus ? `${historyFocus.language}/${historyFocus.slug}` : 'all'} focus={historyFocus} onOpen={(l, s) => openTrack(l, s)} />
      ) : page === 'exams' ? (
        <Exams key={examFocus ?? 'exams'} focus={examFocus} onStarted={enterExam} />
      ) : page === 'vault' ? (
        <Vault onOpen={(l, s) => openTrack(l, s)} />
      ) : (
        <Dashboard
          onOpen={openTrack}
          onHistory={(focus) => {
            setHistoryFocus(focus ?? null);
            goPage('history');
          }}
        />
      )}
      {dialog}
    </div>
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
  /**
   * The server offers a username-only sign-in outside production (D14). The
   * question is asked, not assumed: a failed or missing endpoint means no.
   */
  const [devLogin, setDevLogin] = useState(false);
  const [useReal, setUseReal] = useState(false);

  useEffect(() => {
    api
      .authConfig()
      .then((c) => setDevLogin(c.devLogin === true))
      .catch(() => setDevLogin(false));
  }, []);

  const dev = devLogin && !useReal;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = dev ? await api.devLogin(id.trim()) : await api.login(id, pw);
      onSignedIn(nameOf(r) || id.trim());
    } catch (err) {
      // The backend returns one generic message regardless of which factor
      // failed; surfacing it verbatim preserves that anti-enumeration property.
      setError(err instanceof ApiFailure ? err.error.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || !id.trim() || (!dev && !pw);
  return (
    <Centre>
      <form onSubmit={submit} style={{ width: 'min(22rem, 90vw)', textAlign: 'center' }}>
        <div style={{ color: 'var(--accent-text)', display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
          <Logo size={76} />
        </div>
        <h1 style={{ fontSize: '1.5rem', marginTop: 0, marginBottom: '.3rem' }}>Checkpoints</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 0, marginBottom: '1.5rem' }}>
          {dev ? 'Development sign-in: a username is enough.' : 'Sign in with your reboot01 account.'}
        </p>
        {/* The headings centre, but the fields do not: centred text jumping
            left as you type a username reads as a glitch. */}
        <input
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder={dev ? 'Any username' : 'reboot01 username'}
          autoComplete="username"
          aria-label="Username"
          style={{ ...field, textAlign: 'left' }}
        />
        {!dev && (
          <input value={pw} onChange={(e) => setPw(e.target.value)} type="password" placeholder="Password" autoComplete="current-password" aria-label="Password" style={{ ...field, textAlign: 'left' }} />
        )}
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
        <button type="submit" disabled={disabled} style={{ ...field, ...primaryBtn(disabled) }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        {devLogin && (
          <button type="button" onClick={() => setUseReal((v) => !v)} style={{ ...ghostBtn, fontSize: '.78rem', color: 'var(--text-muted)' }}>
            {useReal ? 'Use the development sign-in' : 'Sign in with reboot01 instead'}
          </button>
        )}
      </form>
    </Centre>
  );
}

// ── workbench ────────────────────────────────────────────────────────────────

interface Pending {
  language: Language;
  slug: string;
  files: Record<string, string>;
}

function Workbench({
  identifier,
  prefs,
  onPrefs,
  onSignedOut,
  onDashboard,
  exam: examStart,
  onExamEnded,
}: {
  identifier: string;
  prefs: Preferences;
  onPrefs: (patch: Partial<Preferences>) => void;
  onSignedOut: (reason?: string) => void;
  onDashboard: () => void;
  /** Exam mode (V3): only the exam's exercises, no drafts, copies or reports. */
  exam?: ExamView;
  onExamEnded?: (id: number) => void;
}) {
  const [exam, setExam] = useState<ExamView | undefined>(examStart);
  const initial = useMemo(() => readLocation(), []);
  const [language, setLanguage] = useState<Language>(() => initial.language ?? lastLanguage());
  const [list, setList] = useState<ExerciseSummary[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  // Seeded from the URL, so a refresh or a shared link opens the same exercise.
  const [slug, setSlug] = useState<string | null>(initial.slug);
  const [detail, setDetail] = useState<ExerciseDetail | null>(null);
  const [files, setFiles] = useState<Record<string, string>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [tab, setTab] = useState<string>('');
  const [phase, setPhase] = useState<RunPhase>('idle');
  /**
   * Cool-down remaining per kind. Run and Test throttle on separate clocks
   * server-side, so one countdown cannot represent both.
   */
  const [cool, setCool] = useState<{ run: number; test: number }>({ run: 0, test: 0 });
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [lastKind, setLastKind] = useState<'run' | 'test'>('test');
  const [args, setArgs] = useState('');
  const [notice, setNotice] = useState<NoticeSpec | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [formatting, setFormatting] = useState(false);
  const [queuePosition, setQueuePosition] = useState(0);
  /** Seconds the current run has been going, and the limit it is counting to. */
  const [elapsed, setElapsed] = useState(0);
  const [limits, setLimits] = useState<RunnerState>({});
  /** Dismissed for THIS run, so the warning cannot nag every second. */
  const [stuckDismissed, setStuckDismissed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const editorRef = useRef<import('monaco-editor').editor.IStandaloneCodeEditor | null>(null);
  const vimStatus = useRef<HTMLDivElement | null>(null);
  const [editorReady, setEditorReady] = useState(false);
  // Vim mode (D24): loaded only when chosen, disposed when switched off.
  useEffect(() => {
    if (prefs.keybindings !== 'vim' || !editorReady || !editorRef.current || !vimStatus.current) return;
    let mode: { dispose: () => void } | null = null;
    let live = true;
    void import('monaco-vim').then(({ initVimMode }) => {
      if (live && editorRef.current && vimStatus.current) mode = initVimMode(editorRef.current, vimStatus.current);
    });
    return () => {
      live = false;
      mode?.dispose();
    };
  }, [prefs.keybindings, editorReady]);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [openLevels, setOpenLevels] = useState<Set<string>>(new Set());
  const term = useRef<TerminalHandle | null>(null);
  const socket = useRef<WebSocket | null>(null);
  const runId = useRef<string | null>(null);
  const { confirm, dialog } = useConfirm();
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'unsaved' | 'failed'>('saved');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [snaps, setSnaps] = useState<SnapshotMeta[]>([]);
  const { toast, showToast } = useToast();
  /**
   * What is pending, and which exercise it belongs to.
   *
   * The language and slug are captured here rather than read at save time: a
   * debounced save that fires after the student has switched exercises would
   * otherwise write one exercise's code into another's row.
   */
  const pending = useRef<Pending | null>(null);

  // Legacy /e/:slug links are Rust; rewrite them so the address bar is honest.
  useEffect(() => {
    if (initial.legacy || !initial.language) navigate(language, initial.slug, { replace: true });
    rememberLanguage(language);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Write whatever is pending. Returns false if there was an edit that could not be saved. */
  const flush = useCallback(async () => {
    const p = pending.current;
    if (!p) return true;
    pending.current = null;
    setSaveState('saving');
    try {
      await api.save(p.language, p.slug, p.files);
      // A newer edit keeps its own browser draft until it is saved too.
      if (!pending.current) clearDraft(p.language, p.slug);
      // A first save starts the exercise (the sidebar's "In progress" filter).
      setList((prev) => prev.map((e) => (e.slug === p.slug && e.status !== 'passed' && !e.passed ? { ...e, status: 'in_progress' } : e)));
      setSaveState('saved');
      setSavedAt(new Date());
      return true;
    } catch (err) {
      // Put it back so the next attempt retries rather than losing the edit,
      // unless a newer edit already replaced it.
      if (!pending.current) pending.current = p;
      // 'failed' rather than 'unsaved': this one is shown, because the student
      // cannot otherwise know their work is at risk.
      setSaveState('failed');
      logger.warn('save.failed', { error: String(err) });
      return false;
    }
  }, []);

  // Leaving the workbench (Back to the dashboard) must not drop the last edit.
  useEffect(() => () => void flush(), [flush]);

  /** Record an edit and mark it unsaved. The debounce below writes it. */
  const markDirty = useCallback(
    (next: Record<string, string>) => {
      if (!detail || !slug) return;
      pending.current = { language, slug, files: next };
      if (!exam) saveDraft(language, slug, next);
      setSaveState('unsaved');
    },
    [detail, language, slug, exam],
  );

  // Persisted so a layout tuned once survives a reload; clamped so no drag can
  // leave a pane unusable.
  const left = usePaneSize('left', 240, 160, 460);
  const right = usePaneSize('right', 620, 360, 1100);
  const results = usePaneSize('results', 240, 90, 640);

  useEffect(() => {
    let live = true;
    setList([]);
    setPlacements([]);
    // The exam has its own list; the track's is closed during it (D28).
    if (exam) return;
    void api
      .exercises(language)
      .then((r) => {
        if (!live) return;
        setList(r.exercises);
        setPlacements(r.placements);
        // A slug that is not a real exercise — mistyped or renamed — should not
        // leave a broken entry behind for Back to return to.
        const current = readLocation();
        if (current.slug && !r.exercises.some((e) => e.slug === current.slug)) {
          setSlug(null);
          navigate(language, null, { replace: true });
        }
      })
      .catch((err) => {
        if (err instanceof ApiFailure && err.status === 401) onSignedOut('Your session expired. Sign in again — your saved work is safe.');
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  // Back and Forward move between exercises and tracks rather than out of the app.
  useEffect(
    () =>
      onNavigate((loc) => {
        if (loc.language) setLanguage(loc.language);
        setSlug(loc.slug);
      }),
    [],
  );

  /** Close the live run's socket. The run itself continues server-side. */
  const detach = useCallback(() => {
    socket.current?.close();
    socket.current = null;
    runId.current = null;
  }, []);
  useEffect(() => detach, [detach]);

  /**
   * Set when the tree itself picked the exercise: its branch is already open,
   * so auto-expanding would only fling open every other checkpoint sharing it.
   */
  const pickedFromTree = useRef(false);

  /** Selecting an exercise is a navigation, so it belongs in the history. */
  const select = useCallback(
    (next: string) => {
      setSlug((prev) => {
        if (prev !== next) pickedFromTree.current = true;
        return next;
      });
      navigate(language, next);
      setPane('subject');
    },
    [language],
  );

  /** Load an exercise's files into the editor. */
  const loadFiles = useCallback((d: ExerciseDetail | { files?: Record<string, string>; libRs?: string | null; mainRs?: string; kind?: string; editorFiles?: string[] }) => {
    const f = filesOf(d as ExerciseDetail);
    setFiles(f.files);
    setOrder(f.order);
    setTab((t) => (f.order.includes(t) ? t : (f.order[0] ?? '')));
    return f;
  }, []);

  useEffect(() => {
    if (!slug) {
      setDetail(null);
      return;
    }
    let live = true;
    const lang = language;
    // Flush the exercise being left before loading the next, or a pending edit
    // would be dropped on the switch.
    void flush()
      .then(() => api.exercise(lang, slug))
      .then((d) => {
        if (!live) return;
        detach();
        setDetail(d);
        const f = filesOf(d);
        // An edit that never reached the server (offline, tab closed) wins over
        // the server copy, and is sent again.
        // The exam keeps no browser drafts: a practice draft must not leak in.
        const draft = exam ? null : readDraft(lang, slug);
        const resumed = draft && draftDiffers(draft, f.files) ? { ...f.files, ...Object.fromEntries(Object.entries(draft).filter(([k]) => k in f.files)) } : null;
        if (!resumed && !exam) clearDraft(lang, slug);
        setFiles(resumed ?? f.files);
        setOrder(f.order);
        setTab(f.order[0] ?? '');
        setPhase('idle');
        setDiagnosis(null);
        setNotice(null);
        setArgs('');
        pending.current = resumed ? { language: lang, slug, files: resumed } : null;
        setSaveState(resumed ? 'unsaved' : 'saved');
        if (!exam) void api.snapshots(lang, slug).then((r) => live && setSnaps(r.snapshots)).catch(() => setSnaps([]));
        else setSnaps([]);
        // Arriving by link, refresh or Back on a collapsed tree gives no clue where
        // the open exercise sits, so open its first branch.
        const first = d.placements?.[0];
        if (!pickedFromTree.current && first) {
          setOpenGroups((prev) => new Set([...prev, first.checkpoint]));
          setOpenLevels((prev) => new Set([...prev, `${first.checkpoint}/${first.level}`]));
        }
        pickedFromTree.current = false;
      })
      .catch((err) => {
        if (!live) return;
        if (err instanceof ApiFailure && err.status === 401) {
          onSignedOut('Your session expired. Sign in again — your saved work is safe.');
          return;
        }
        if (err instanceof ApiFailure && err.status === 404) {
          setSlug(null);
          navigate(lang, null, { replace: true });
        }
      });
    return () => {
      live = false;
    };
    // flush is stable; re-running this on every keystroke would reload the file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, language]);

  // Autosave shortly after typing stops. Without this, work done between runs
  // is lost if the tab closes.
  useEffect(() => {
    if (saveState !== 'unsaved') return;
    const id = setTimeout(() => void flush(), AUTOSAVE_MS);
    return () => clearTimeout(id);
  }, [saveState, files, flush]);

  // A failed save retries: soon, and at once when the connection returns.
  const online = useOnline();
  useEffect(() => {
    if (saveState !== 'failed') return;
    if (online) {
      const id = setTimeout(() => void flush(), 5000);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [saveState, online, flush]);
  useEffect(() => {
    if (online && pending.current) void flush();
  }, [online, flush]);

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

  // Cool-down countdown, so a disabled button always explains itself.
  useEffect(() => {
    if (cool.run <= 0 && cool.test <= 0) return;
    const t = setTimeout(
      () => setCool((c) => ({ run: Math.max(0, c.run - 1), test: Math.max(0, c.test - 1) })),
      1000,
    );
    return () => clearTimeout(t);
  }, [cool]);

  // Fetched once at mount, so the first run already shows its limit.
  useEffect(() => {
    void api
      .runnerState()
      .then(setLimits)
      .catch(() => undefined);
  }, []);

  // One tick per second while a run is in flight. A queued run counts from
  // when it was submitted.
  useEffect(() => {
    if (phase !== 'running' && phase !== 'queued' && phase !== 'starting') return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
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

  const passed = useMemo(
    () => new Set(list.filter((e) => e.passed ?? e.status === 'passed').map((e) => e.slug)),
    [list],
  );
  const starred = useMemo(() => new Set(list.filter((e) => e.starred).map((e) => e.slug)), [list]);

  // V2 sidebar: search and status filter give a flat list; the rail hides it.
  const [query, setQuery] = useState('');
  const [show, setShow] = useState<SidebarFilter>('all');
  // The exam panel holds the timer, so it never collapses.
  const [rail, setRail] = useState(() => !examStart && readFlag('cp.rail'));
  // Phones and tablets: one pane at a time, chosen by tabs.
  const compact = useMedia(COMPACT_QUERY);
  const [pane, setPane] = useState<MobilePane>(() => (readLocation().slug ? 'subject' : 'list'));
  const hideIf = (cond: boolean): React.CSSProperties => (cond ? { display: 'none' } : {});
  const typeText = (text: string) => {
    const ed = editorRef.current;
    if (!ed) return;
    const sel = ed.getSelection();
    if (!sel) return;
    ed.focus();
    ed.executeEdits('symbol-bar', [{ range: sel, text, forceMoveMarkers: true }]);
    ed.pushUndoStop();
  };
  const editorCommand = (id: 'undo' | 'redo') => {
    const ed = editorRef.current;
    if (!ed) return;
    ed.focus();
    ed.trigger('symbol-bar', id, null);
  };
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle && show === 'all') return null;
    return list.filter((e) => {
      if (needle && !e.slug.toLowerCase().includes(needle) && !(e.title ?? '').toLowerCase().includes(needle)) return false;
      const st = passed.has(e.slug) ? 'passed' : e.status === 'in_progress' ? 'in_progress' : 'not_started';
      if (show === 'starred') return !!e.starred;
      return show === 'all' || show === st;
    });
  }, [list, query, show, passed]);

  const toggleRail = () => {
    setRail((r) => {
      writeFlag('cp.rail', !r);
      return !r;
    });
  };

  const toggleStar = (s: string) => {
    const on = !starred.has(s);
    setList((prev) => prev.map((e) => (e.slug === s ? { ...e, starred: on } : e)));
    api.star(language, s, on).catch((err) => {
      logger.warn('star.failed', { error: String(err) });
      setList((prev) => prev.map((e) => (e.slug === s ? { ...e, starred: !on } : e)));
    });
  };

  /**
   * Advisory problems the checkpoint would reject, found before Submit. Only
   * the graded files: a demo main is never submitted, so its imports are fine.
   */
  const lintWarnings = useMemo<string[]>(() => {
    if (!detail) return [];
    const graded = detail.expectedFiles?.length ? detail.expectedFiles : null;
    if (language === 'go' && graded) {
      const subset = Object.fromEntries(Object.entries(files).filter(([f]) => graded.includes(f)));
      return lintGo(subset, detail.allowedFunctions ?? [], detail.studentPackage).map(
        (l) => `${l.file}:${l.line} — ${l.message}`,
      );
    }
    if (language === 'js' && graded?.[0]) {
      return lintJs(files[graded[0]] ?? '', detail.reservedNames ?? []).map((w) => w.message);
    }
    return [];
  }, [detail, files, language]);

  const toggle = (set: (fn: (prev: Set<string>) => Set<string>) => void, key: string) =>
    set((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  function sessionExpired() {
    setPhase('idle');
    detach();
    onSignedOut('Your session expired. Sign in again — your saved work is safe.');
  }

  async function execute(kind: 'run' | 'test') {
    if (!detail || !slug) return;
    if (compact) setPane('output');
    const lang = language;
    const exerciseSlug = slug;
    // The runner must grade what is on screen. If the save did not land, the
    // stored copy is stale — stop rather than report a result for other code.
    if (!(await flush())) {
      setNotice({
        tone: 'error',
        title: 'Your latest changes could not be saved, so the run was stopped.',
        detail: 'Check your connection and try again — the run would have used your previous code.',
      });
      return;
    }
    detach();
    setDiagnosis(null);
    setLastKind(kind);
    setNotice(null);
    setCancelling(false);
    setElapsed(0);
    setQueuePosition(0);
    setStuckDismissed(false);
    setPhase('starting');
    // Clear first: the previous result must not be mistaken for this one.
    term.current?.clear();
    term.current?.write(`\x1b[36m$ ${shownCommand(lang, kind, args, order)}\x1b[0m\r\n`);

    let started;
    try {
      started = await api.start(lang, exerciseSlug, kind, files, splitArgs(args));
    } catch (err) {
      if (err instanceof ApiFailure && (err.error.code === 'cooling_down' || err.status === 429)) {
        // Reachable from a second tab, where this tab's countdown is unaware of
        // the other's run.
        const wait = err.error.secondsRemaining ?? 5;
        setCool((c) => ({ ...c, [kind]: wait }));
        setPhase('cooling-down');
        term.current?.write(`\r\n\x1b[33m[waiting ${wait}s before the next ${kind}]\x1b[0m\r\n`);
        return;
      }
      if (err instanceof ApiFailure && err.status === 401) return sessionExpired();
      if (err instanceof ApiFailure && (err.error.code === 'runner_unavailable' || err.status === 503)) {
        term.current?.write(`\r\n\x1b[31m${err.error.message}\x1b[0m\r\n`);
        setNotice(noticeFor('runner_error'));
        setPhase('idle');
        return;
      }
      logger.error('run.failed', { error: String(err) });
      term.current?.write(`\r\n\x1b[31m${err instanceof ApiFailure ? err.error.message : 'The run could not be started.'}\x1b[0m\r\n`);
      setPhase('idle');
      return;
    }

    runId.current = started.runId;
    if ((started.queuePosition ?? 0) > 0) {
      setQueuePosition(started.queuePosition ?? 0);
      setPhase('queued');
    }
    listen(started.runId, kind, lang, exerciseSlug, started.cooldownSeconds ?? 0);
  }

  /** Stream a run's output from /ws/runs/:id until it is done. */
  function listen(id: string, kind: 'run' | 'test', lang: Language, exerciseSlug: string, startCooldown: number) {
    const ws = new WebSocket(runSocketUrl(id));
    socket.current = ws;
    let collected = '';
    let finished = false;

    ws.onmessage = (event) => {
      if (socket.current !== ws) return;
      let m: RunMessage;
      try {
        m = JSON.parse(String(event.data)) as RunMessage;
      } catch {
        return;
      }
      if (m.type === 'output') {
        const chunk = m.data ?? m.text ?? '';
        collected += chunk;
        // xterm needs CR LF; normalise without doubling an existing CR.
        term.current?.write(chunk.replace(/\r?\n/g, '\r\n'));
      } else if (m.type === 'state') {
        if (m.state === 'queued') {
          setQueuePosition(m.queuePosition ?? 0);
          setPhase('queued');
        } else if (m.state === 'starting') {
          setPhase('starting');
        } else if (m.state === 'running') {
          setPhase('running');
        }
      } else if (m.type === 'done') {
        finished = true;
        finish(m, collected, kind, lang, exerciseSlug, startCooldown);
        ws.close();
      }
    };
    const lost = () => {
      if (finished || socket.current !== ws) return;
      finished = true;
      socket.current = null;
      runId.current = null;
      setCancelling(false);
      setPhase('idle');
      setNotice({
        tone: 'warn',
        title: 'Lost the connection to the run.',
        detail: 'Its result may not appear here. Check your connection and run again.',
      });
    };
    ws.onerror = lost;
    ws.onclose = lost;
  }

  function finish(
    m: Extract<RunMessage, { type: 'done' }>,
    output: string,
    kind: 'run' | 'test',
    lang: Language,
    exerciseSlug: string,
    startCooldown: number,
  ) {
    socket.current = null;
    runId.current = null;
    const canonical = canonicalOutcome(m.outcome, m.exitCode);
    const d = diagnoseRun(lang, kind, {
      outcome: m.outcome,
      exitCode: m.exitCode,
      output,
      limits: { timeoutSeconds: m.timeoutSeconds ?? limits.timeoutSeconds, outputLimitBytes: limits.outputLimitBytes, memoryMb: limits.memoryMb },
    });
    // A hint under the output, dimmed and prefixed so it is never mistaken for
    // something the toolchain said. Stopped runs are explained by the notice.
    const stopped = ['timeout', 'cancelled', 'oom', 'output_limit', 'error'].includes(canonical);
    if (d.hint && !stopped) term.current?.write(`\r\n\x1b[2m── ${d.title}: ${d.hint}\x1b[0m\r\n`);
    if (stopped && canonical !== 'error') {
      term.current?.write(`\r\n\x1b[33m[${canonical === 'cancelled' ? 'cancelled' : 'stopped'}]\x1b[0m\r\n`);
    }
    setNotice(
      noticeFor(noticeOutcome(canonical), {
        timeoutSeconds: m.timeoutSeconds ?? limits.timeoutSeconds,
        argsTruncated: m.argsTruncated,
        maxArgs: m.maxArgs,
        emptyOutput: canonical === 'passed' && output.trim() === '',
        kind,
      }),
    );
    setDiagnosis(d);
    setPhase('done');
    setCancelling(false);
    // The server starts this kind's clock when the run ends; so does the UI.
    setCool((c) => ({ ...c, [kind]: m.cooldownSeconds ?? startCooldown }));
    const didPass = m.passed ?? (kind === 'test' && canonical === 'passed');
    if (exam && kind === 'test') {
      void api.exam(exam.id).then(setExam).catch(() => undefined);
    } else if (kind === 'test' && didPass && lang === language) {
      setList((prev) => prev.map((e) => (e.slug === exerciseSlug ? { ...e, passed: true, status: 'passed' } : e)));
      // Submit stores the passing code; pick the new snapshot up.
      void api.snapshots(lang, exerciseSlug).then((r) => setSnaps(r.snapshots)).catch(() => undefined);
    }
  }

  /** Stop the run in flight. The socket stays open to receive 'done'. */
  async function cancelRun() {
    const id = runId.current;
    if (!running || !id) return;
    setCancelling(true);
    try {
      await api.cancelRun(id);
    } catch (err) {
      // Losing the race — the run finished first — is not worth reporting.
      logger.error('cancel.failed', { error: String(err) });
      setCancelling(false);
    }
  }

  /** Go only: gofumpt server-side, the formatter the checkpoint gates on. */
  async function formatCode() {
    if (!detail || !slug || language !== 'go') return;
    setFormatting(true);
    try {
      const r = await api.format(language, slug, files);
      const next = { ...files, ...r.files };
      setFiles(next);
      markDirty(next);
      showToast(r.changed.length ? `Formatted ${r.changed.join(', ')}` : 'Already formatted');
    } catch (err) {
      if (err instanceof ApiFailure && err.status === 401) return sessionExpired();
      showToast(err instanceof ApiFailure ? err.error.message : 'Could not format');
    } finally {
      setFormatting(false);
    }
  }

  async function signOut() {
    const ok = await confirm({
      title: 'Sign out?',
      body: 'Your saved code stays on the server — you can sign back in and pick up where you left off.',
      confirmLabel: 'Sign out',
    });
    if (!ok) return;
    await flush();
    // Revoke the session even if the request fails.
    await api.logout().catch(() => undefined);
    clearAllDrafts();
    detach();
    onSignedOut();
  }

  /** End the exam (or record that its time ran out) and show the report. */
  async function endExam(expired = false) {
    if (!exam) return;
    if (!expired) {
      const ok = await confirm({
        title: 'End the exam?',
        body: 'Your results go to the exam report. You cannot return to this exam.',
        confirmLabel: 'End exam',
      });
      if (!ok) return;
    }
    await flush();
    try {
      await (expired ? api.exam(exam.id) : api.endExam(exam.id, false));
    } catch (err) {
      logger.warn('exam.end_failed', { error: String(err) });
    }
    onExamEnded?.(exam.id);
  }

  async function saveCopy() {
    if (!detail || !slug) return;
    await flush();
    try {
      await api.saveSnapshot(language, slug, files);
      const r = await api.snapshots(language, slug);
      setSnaps(r.snapshots);
      showToast('Copy saved');
    } catch (err) {
      showToast(err instanceof ApiFailure ? err.error.message : 'Could not save a copy');
    }
  }

  async function restore(id: number, label: string) {
    if (!detail || !slug) return;
    // Drop the pending edit, or the autosave would write the old code back over
    // what was just restored.
    pending.current = null;
    try {
      const r = await api.restoreSnapshot(language, slug, id);
      loadFiles({ ...r, kind: detail.kind, editorFiles: order });
      setSaveState('saved');
      showToast(`Restored ${label}`);
    } catch (err) {
      showToast(err instanceof ApiFailure ? err.error.message : 'Could not restore');
    }
  }

  async function resetExercise() {
    if (!detail || !slug) return;
    const ok = await confirm({
      title: 'Reset this exercise?',
      body: 'Your saved code for this exercise is replaced with the starting stub. This cannot be undone.',
      confirmLabel: 'Reset',
      destructive: true,
    });
    if (!ok) return;
    pending.current = null;
    try {
      await api.reset(language, slug);
      const d = await api.exercise(language, slug);
      loadFiles(d);
      setSaveState('saved');
      showToast('Restored the starting stub');
    } catch (err) {
      showToast(err instanceof ApiFailure ? err.error.message : 'Could not reset');
    }
  }

  const running = phase === 'running' || phase === 'starting' || phase === 'queued';
  // One shared wait (D18): after Run or Submit, both stay blocked until it ends.
  const wait = Math.max(cool.run, cool.test);
  const cooling = wait > 0;
  const blocked = { run: running || cooling || !online, test: running || cooling || !online };
  const passingSnap = snaps.find((s) => s.kind === 'passing');
  const manualSnaps = snaps.filter((s) => s.kind === 'manual');
  // Rust shows arguments only where the exercise reads argv; Go and JS
  // programs may always take them.
  const showArgs = !!detail && (detail.argv === true || (language !== 'rust' && detail.argv !== false));
  const readme = detail?.readme ?? detail?.subject ?? '';

  return (
    <div style={{ display: 'flex', flexDirection: compact ? 'column' : 'row', height: '100dvh', width: '100vw', overflow: 'hidden' }}>
      {compact && (
        <nav aria-label="Workbench panes" role="tablist" style={{ display: 'flex', borderBottom: '1px solid var(--border)', flex: '0 0 auto', background: 'var(--surface)' }}>
          {MOBILE_PANES.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={pane === id}
              onClick={() => setPane(id)}
              style={{
                ...ghostBtn, flex: 1, padding: '.6rem .2rem', fontSize: '.82rem', borderRadius: 0,
                color: pane === id ? 'var(--accent-text)' : 'var(--text-muted)', boxShadow: pane === id ? 'inset 0 -2px 0 var(--accent)' : 'none',
              }}
            >
              {label}
            </button>
          ))}
        </nav>
      )}
      {/* ── left: exercise tree, or the compact rail (V2) ─────────────────── */}
      {rail && !compact && (
        <nav
          aria-label="Compact sidebar"
          style={{ width: '2.6rem', flex: '0 0 auto', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.5rem', padding: '.6rem 0' }}
        >
          <button type="button" onClick={toggleRail} aria-label="Expand the exercise list" title="Expand" style={{ ...ghostBtn, fontSize: '1rem' }}>
            »
          </button>
          {!exam && (
            <button type="button" onClick={() => void flush().then(onDashboard)} aria-label="Dashboard" title="Dashboard" style={{ ...ghostBtn, fontSize: '1rem' }}>
              ⌂
            </button>
          )}
          <span title={LANGUAGE_LABEL[language]} style={{ fontSize: '.7rem', color: 'var(--text-muted)', writingMode: 'vertical-rl' }}>
            {LANGUAGE_LABEL[language]}
          </span>
        </nav>
      )}
      <aside
        hidden={compact ? pane !== 'list' : rail}
        style={{
          display: (compact ? pane !== 'list' : rail) ? 'none' : undefined,
          width: compact ? '100%' : left.size,
          flex: compact ? '1 1 0' : '0 0 auto',
          borderRight: '1px solid var(--border)',
          overflowY: 'auto',
          padding: '.6rem',
          minWidth: 0,
        }}
      >
        {exam && (
          <ExamPanel
            exam={exam}
            current={slug}
            onSelect={select}
            onEnd={() => void endExam()}
            onExpired={() => void endExam(true)}
          />
        )}
        {!exam && (
        <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.6rem' }}>
          <strong style={{ fontSize: '.85rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>{identifier}</strong>
          <span style={{ display: 'flex', gap: '.2rem' }}>
            <button type="button" onClick={() => void signOut()} style={{ ...ghostBtn, fontSize: '.75rem' }}>
              Sign out
            </button>
            <button type="button" onClick={toggleRail} aria-label="Collapse the exercise list" title="Collapse" style={{ ...ghostBtn, fontSize: '.85rem' }}>
              «
            </button>
          </span>
        </div>

        {/* The track is chosen on the dashboard (D23); here it is only named. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.4rem', marginBottom: '.7rem' }}>
          <button
            type="button"
            onClick={() => void flush().then(onDashboard)}
            style={{ ...ghostBtn, fontSize: '.78rem', color: 'var(--accent-text)', padding: '.2rem 0' }}
          >
            ← Dashboard
          </button>
          <span style={{ fontSize: '.78rem', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '.1rem .45rem' }}>
            {LANGUAGE_LABEL[language]}
          </span>
        </div>

        {/* A track without placements still lists its exercises, flat. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.35rem', marginBottom: '.6rem' }}>
          <input
            type="search"
            aria-label="Search exercises"
            placeholder="Search exercises…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ ...sideInput }}
          />
          <select aria-label="Show" value={show} onChange={(e) => setShow(e.target.value as SidebarFilter)} style={{ ...sideInput }}>
            <option value="all">All exercises</option>
            <option value="not_started">Not started</option>
            <option value="in_progress">In progress</option>
            <option value="passed">Passed</option>
            <option value="starred">Starred</option>
          </select>
        </div>

        {list.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.45rem' }}>
            {[0, 1, 2, 3, 4].map((k) => (
              <Skeleton key={k} height=".9rem" width={`${85 - k * 9}%`} />
            ))}
          </div>
        )}

        {filtered && filtered.length === 0 && <p style={{ color: 'var(--text-dim)', fontSize: '.8rem', margin: '.3rem .2rem' }}>Nothing matches.</p>}

        {(filtered ?? (grouped.size === 0 ? list : [])).map((e) => (
          <ExerciseRow
            key={e.slug}
            slug={e.slug}
            current={slug === e.slug}
            done={passed.has(e.slug)}
            star={starred.has(e.slug)}
            onSelect={() => select(e.slug)}
            onStar={() => toggleStar(e.slug)}
            indent=".3rem"
          />
        ))}

        {!filtered && [...grouped.entries()].map(([checkpoint, levels]) => {
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
                            <ExerciseRow
                              key={`${levelKey}/${s}`}
                              slug={s}
                              current={slug === s}
                              done={passed.has(s)}
                              star={starred.has(s)}
                              onSelect={() => select(s)}
                              onStar={() => toggleStar(s)}
                              indent="1.15rem"
                            />
                          ))}
                      </div>
                    );
                  })}
            </div>
          );
        })}
        </>
        )}
      </aside>

      {!rail && !compact && <Splitter axis="x" label="Resize the exercise list" onDelta={left.nudge} onCommit={left.persist} />}

      {/* ── centre: instructions ─────────────────────────────────────────
        * No title bar: every README opens with the exercise's own heading, so a
        * separate one would repeat it. Progress and placement are already in the
        * sidebar — the checkmark and the tree position say both.
        */}
      <section style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, ...hideIf(compact && pane !== 'subject') }}>
        <div className="markdown" style={{ flex: '1 1 0', overflowY: 'auto', padding: '1.1rem 1.3rem' }}>
          {detail ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {readme}
            </ReactMarkdown>
          ) : slug ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
              <Skeleton height="1.5rem" width="40%" />
              <Skeleton />
              <Skeleton width="90%" />
              <Skeleton width="75%" />
            </div>
          ) : (
            <p style={{ color: 'var(--text-dim)' }}>Choose an exercise from the list to begin.</p>
          )}
        </div>
      </section>

      {!compact && <Splitter axis="x" label="Resize the instructions" onDelta={(d) => right.nudge(-d)} onCommit={right.persist} />}

      {/* ── right: editor, arguments, actions, results ──────────────────── */}
      <section
        style={{
          width: compact ? '100%' : right.size,
          flex: compact ? '1 1 0' : '0 0 auto',
          display: 'flex',
          flexDirection: 'column',
          borderLeft: compact ? 'none' : '1px solid var(--border)',
          minWidth: 0,
          minHeight: 0,
          position: 'relative',
          ...hideIf(compact && pane !== 'code' && pane !== 'output'),
        }}
      >
        {/* A. file buttons */}
        <div style={{ display: 'flex', gap: '.3rem', padding: '.45rem .6rem', borderBottom: '1px solid var(--border)', flex: '0 0 auto', ...hideIf(compact && pane === 'output') }}>
          {order.map((f) => (
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
              {f}
            </button>
          ))}

          {/* Autosave says nothing when it works — the student did not ask for
              it and cannot act on it. A FAILED save is shown, and stays shown,
              because it means their work is at risk. */}
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '.6rem' }}>
            {saveState === 'failed' && (
              <span style={{ color: 'var(--warning)', fontSize: '.76rem' }} role="status">
                {online ? 'Not saved — retrying' : 'Offline — kept in this browser'}
              </span>
            )}
            {/* Preferences are the editor's own settings, so they live on the editor. */}
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="Editor preferences"
              title="Editor preferences"
              style={{ ...ghostBtn, fontSize: '1rem', lineHeight: 1, padding: '.2rem .35rem' }}
            >
              ⚙
            </button>
            <Menu
              note={savedAt ? `Saved ${timeAgo(savedAt)}` : undefined}
              /* Per-item `disabled`: the menu drops disabled items. */
              groups={[
                [{ label: 'Save a copy', onSelect: () => void saveCopy(), disabled: !detail || !!exam }],
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
                [
                  {
                    label: 'Export report',
                    disabled: !detail || !slug || !!exam,
                    onSelect: () =>
                      void flush().then(() => {
                        if (!slug) return;
                        const link = document.createElement('a');
                        link.href = reportUrl(language, slug);
                        link.download = `${language}-${slug}.md`;
                        link.click();
                      }),
                  },
                ],
              ]}
            />
          </span>
        </div>

        {lintWarnings.length > 0 && (
          <div role="status" style={{ padding: '.35rem .6rem', borderBottom: '1px solid var(--border)', color: 'var(--warning)', fontSize: '.76rem', display: 'flex', flexDirection: 'column', gap: '.15rem', flex: '0 0 auto' }}>
            {lintWarnings.map((w, i) => (
              <span key={i}>⚠ {w}</span>
            ))}
          </div>
        )}

        {/* B. editor */}
        <div style={{ flex: '1 1 0', minHeight: 0, ...hideIf(compact && pane === 'output') }}>
          <Editor
            height="100%"
            /* Monaco's built-in vs-dark sits at #1e1e1e, several stops lighter
               than the shell, which made the editor look like a pasted-in panel.
               This is vs-dark with the surfaces swapped for the theme tokens;
               Monaco cannot read CSS variables, so the values are literals. */
            beforeMount={defineEditorTheme}
            theme="checkpoints"
            onMount={(ed) => {
              editorRef.current = ed;
              setEditorReady(true);
            }}
            language={editorLanguage(tab, language)}
            path={`${language}/${detail?.slug ?? 'none'}/${tab}`}
            value={files[tab] ?? ''}
            onChange={(v) => {
              if (!tab) return;
              const next = { ...files, [tab]: v ?? '' };
              setFiles(next);
              markDirty(next);
            }}
            options={{
              minimap: { enabled: false },
              fontSize: prefs.fontSize,
              tabSize: prefs.tabSize,
              detectIndentation: false,
              // Go is formatted with real tabs (gofmt, the Submit gate); JS and Rust with spaces.
              insertSpaces: language !== 'go',
              wordWrap: prefs.wordWrap ? 'on' : 'off',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              padding: { top: 8 },
            }}
          />
        </div>
        {/* Vim's mode line (-- INSERT --, :commands); only in Vim mode. */}
        <div
          ref={vimStatus}
          style={{
            display: prefs.keybindings === 'vim' ? 'block' : 'none',
            flex: '0 0 auto',
            padding: '.15rem .6rem',
            borderTop: '1px solid var(--border)',
            fontFamily: 'ui-monospace, monospace',
            fontSize: '.75rem',
            color: 'var(--text-muted)',
            minHeight: '1.4rem',
          }}
        />

        {/* Phones: the symbols a touch keyboard hides, and undo/redo. */}
        {compact && pane === 'code' && (
          <div
            aria-label="Symbols"
            style={{ display: 'flex', gap: '.25rem', padding: '.3rem .4rem', overflowX: 'auto', borderTop: '1px solid var(--border)', flex: '0 0 auto', background: 'var(--surface)' }}
          >
            <button type="button" aria-label="Undo" onMouseDown={(e) => e.preventDefault()} onClick={() => editorCommand('undo')} style={symbolBtn}>
              ↶
            </button>
            <button type="button" aria-label="Redo" onMouseDown={(e) => e.preventDefault()} onClick={() => editorCommand('redo')} style={symbolBtn}>
              ↷
            </button>
            <button type="button" aria-label="Tab" onMouseDown={(e) => e.preventDefault()} onClick={() => typeText('\t')} style={symbolBtn}>
              ⇥
            </button>
            {SYMBOLS.map((c) => (
              <button key={c} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => typeText(c)} style={symbolBtn}>
                {c}
              </button>
            ))}
          </div>
        )}

        {/* C. arguments — only where the exercise reads argv */}
        {showArgs && !(compact && pane === 'output') && (
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
              {language === 'go' && (
                <button type="button" onClick={() => void formatCode()} disabled={formatting || !detail} style={outlineBtn(formatting || !detail)} title="Format with gofumpt, as the checkpoint requires">
                  {formatting ? 'Formatting…' : 'Format'}
                </button>
              )}
            </>
          )}
          {cooling && (
            <span style={{ color: 'var(--text-muted)', fontSize: '.8rem', fontVariantNumeric: 'tabular-nums' }}>
              {`Ready in ${fmtWait(wait)}`}
            </span>
          )}

          <span style={{ marginLeft: 'auto' }}>
            <RunState
              phase={phase}
              seconds={wait}
              elapsed={elapsed}
              timeoutSeconds={limits.timeoutSeconds}
              queuePosition={queuePosition}
              diagnosis={diagnosis}
            />
          </span>
        </div>

        {!compact && <Splitter axis="y" label="Resize the results" onDelta={(d) => results.nudge(-d)} onCommit={results.persist} />}

        {toast}

        {/* E. results */}
        <RunNotice notice={notice} />
        <div
          style={{
            height: compact ? undefined : results.size,
            flex: compact ? '1 1 0' : '0 0 auto',
            borderTop: '1px solid var(--border)',
            minHeight: 0,
            ...hideIf(compact && pane !== 'output'),
          }}
        >
          <TerminalPane key={compact ? 'plain' : 'xterm'} plain={compact} onReady={(h) => (term.current = h)} />
        </div>
      </section>

      {dialog}
      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} prefs={prefs} onChange={onPrefs} />
      <StuckDialog
        open={
          running &&
          !cancelling &&
          !stuckDismissed &&
          limits.warnSeconds !== undefined &&
          elapsed >= limits.warnSeconds
        }
        elapsed={elapsed}
        timeoutSeconds={limits.timeoutSeconds ?? 60}
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
  monaco.editor.defineTheme('checkpoints', {
    base: 'vs-dark',
    inherit: true, // keep vs-dark's token colours; only surfaces change
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
const symbolBtn: React.CSSProperties = {
  flex: 'none', minWidth: '2.1rem', padding: '.35rem .4rem', background: 'var(--raised)', color: 'var(--text)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius)', font: 'inherit', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: '.9rem', cursor: 'pointer',
};

type MobilePane = 'list' | 'subject' | 'code' | 'output';
const MOBILE_PANES: [MobilePane, string][] = [
  ['list', 'Exercises'],
  ['subject', 'Subject'],
  ['code', 'Code'],
  ['output', 'Output'],
];

const sideInput: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', background: 'var(--raised)', color: 'var(--text)', border: '1px solid var(--border-strong)',
  borderRadius: 'var(--radius)', padding: '.28rem .45rem', font: 'inherit', fontSize: '.8rem',
};

const ghostBtn: React.CSSProperties = {
  background: 'transparent', color: 'var(--text)', border: 'none',
  cursor: 'pointer', font: 'inherit', fontSize: '.85rem', padding: '.25rem .4rem',
};

// ── sidebar filters and rail (V2) ────────────────────────────────────────────

type SidebarFilter = 'all' | 'not_started' | 'in_progress' | 'passed' | 'starred';

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? '1' : '0');
  } catch {
    /* storage blocked: the rail just is not remembered */
  }
}

function ExerciseRow({ slug, current, done, star, onSelect, onStar, indent }: {
  slug: string; current: boolean; done: boolean; star: boolean; onSelect: () => void; onStar: () => void; indent: string;
}) {
  return (
    <div className="cp-row" style={{ display: 'flex', alignItems: 'center' }}>
      <button
        type="button"
        onClick={onSelect}
        aria-current={current ? 'true' : undefined}
        style={{
          ...ghostBtn, display: 'flex', alignItems: 'center', gap: '.35rem', flex: 1, minWidth: 0, textAlign: 'left',
          color: current ? 'var(--accent-text)' : 'var(--text-muted)', fontSize: '.82rem', padding: `.15rem .3rem .15rem ${indent}`, overflow: 'hidden',
        }}
      >
        {/* Reserved whether or not it is filled, so a row does not shift
            sideways once it starts passing. */}
        <span style={{ width: 12, flex: 'none', color: 'var(--success)' }}>{done && <Icon name="check" size={12} />}</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{slug}</span>
      </button>
      <button
        type="button"
        aria-pressed={star}
        aria-label={star ? `Unstar ${slug}` : `Star ${slug}`}
        title={star ? 'Unstar' : 'Star'}
        className={star ? 'cp-star cp-star-on' : 'cp-star'}
        onClick={onStar}
        style={{ ...ghostBtn, flex: 'none', color: star ? 'var(--warning, #eab308)' : 'var(--text-dim)', padding: '0 .25rem', fontSize: '.85rem' }}
      >
        {star ? '★' : '☆'}
      </button>
    </div>
  );
}

/** Remaining time as h:mm:ss. */
export function fmtCountdown(ms: number): string {
  const t = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/** The exam's side panel (V3): timer, the exercises by level, End exam. */
function ExamPanel({ exam, current, onSelect, onEnd, onExpired }: {
  exam: ExamView; current: string | null; onSelect: (slug: string) => void; onEnd: () => void; onExpired: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const left = Date.parse(exam.endsAt) - now;
  const fired = useRef(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (left <= 0 && !fired.current) {
      fired.current = true;
      onExpired();
    }
  }, [left, onExpired]);
  const low = left < 10 * 60_000;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }} aria-label="Mock exam">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: '.85rem' }}>
          Mock exam · {LANGUAGE_LABEL[exam.language]} · Checkpoint {exam.checkpoint}
        </strong>
      </div>
      <div
        role="timer"
        aria-live="off"
        title={`Ends at ${new Date(exam.endsAt).toLocaleTimeString()}`}
        style={{ fontSize: '1.6rem', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: low ? 'var(--danger)' : 'var(--text)' }}
      >
        {fmtCountdown(left)}
      </div>
      <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>
        {exam.passed} / {exam.total} passed · {STATUS_LABEL[exam.status]}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.15rem' }}>
        {exam.items.map((i) => (
          <button
            key={i.slug}
            type="button"
            onClick={() => onSelect(i.slug)}
            aria-current={current === i.slug ? 'true' : undefined}
            style={{
              ...treeRow(current === i.slug ? 'var(--accent-text)' : 'var(--text)', '.8rem'),
              background: current === i.slug ? 'var(--raised)' : 'transparent',
            }}
          >
            <span style={{ color: 'var(--text-dim)', width: '3.6rem', flex: 'none' }}>Level {i.level}</span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.title}</span>
            {i.passed && <span style={{ color: 'var(--success)' }}>✓</span>}
          </button>
        ))}
      </div>
      <p style={{ margin: 0, color: 'var(--text-dim)', fontSize: '.74rem', lineHeight: 1.45 }}>
        Hints, solutions and other exercises are closed until the exam ends. Your practice code is set aside and comes back afterwards.
      </p>
      <button type="button" onClick={onEnd} style={{ ...ghostBtn, border: '1px solid var(--border-strong)', padding: '.35rem .6rem', fontSize: '.8rem' }}>
        End exam
      </button>
    </div>
  );
}
