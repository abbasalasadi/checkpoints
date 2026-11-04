/**
 * Mock exams (V3 feature 1): start one, and read the reports of past ones.
 * An exam is one random exercise per level of a checkpoint, from fresh
 * starters, with a timer. Results stay separate from practice (D27); while it
 * runs, hints, solutions and other exercises are closed (D28).
 */
import { useEffect, useState } from 'react';
import { api, ApiFailure, type ExamView, type Language } from '../lib/api.js';
import { LANGUAGE_LABEL, ago } from '../lib/format.js';
import { LANGUAGES } from '../lib/route.js';
import { fmtSpent } from '../lib/timeline.js';
import { logger } from '../logger.js';
import { MarkRing, fmtPercent } from './MarkRing.js';
import { Modal } from './Modal.js';
import { Skeleton } from './Skeleton.js';
import { useConfirm } from './Dialog.js';
import { Icon } from './Icon.js';

interface Props {
  /** Called once an exam has started (or one is already running). */
  onStarted: (exam: ExamView) => void;
  /** The report to open first, e.g. the exam that just ended. */
  focus?: number | null;
  /** An exam that just ended: its result pops up once (V4). */
  result?: number | null;
  onResultSeen?: () => void;
  onDashboard?: () => void;
}

const panel: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1rem 1.1rem', minWidth: 0,
};
const input: React.CSSProperties = {
  background: 'var(--raised)', color: 'var(--text)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)',
  padding: '.35rem .5rem', font: 'inherit', fontSize: '.85rem',
};
const primary: React.CSSProperties = {
  background: 'var(--accent)', color: '#fff', border: '1px solid var(--accent)', borderRadius: 'var(--radius)',
  padding: '.45rem 1rem', font: 'inherit', fontSize: '.86rem', cursor: 'pointer',
};

export const STATUS_LABEL: Record<ExamView['status'], string> = {
  active: 'Running',
  finished: 'Finished',
  abandoned: 'Abandoned',
  expired: 'Time ran out',
};

/** Time the exam took: to its end, or to now while it runs. */
export function examSpent(e: ExamView): number {
  const end = e.endedAt ? Date.parse(e.endedAt) : Date.now();
  return Math.max(0, end - Date.parse(e.startedAt));
}

export function ExamReport({ exam, open, onToggle, onDelete }: { exam: ExamView; open: boolean; onToggle: () => void; onDelete?: () => void }) {
  const allPassed = exam.total > 0 && exam.passed === exam.total;
  return (
    <li style={{ ...panel, listStyle: 'none', padding: '.55rem .9rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{ display: 'flex', alignItems: 'center', gap: '.8rem', width: '100%', background: 'transparent', border: 'none', color: 'var(--text)', font: 'inherit', fontSize: '.84rem', textAlign: 'left', padding: 0, cursor: 'pointer', flexWrap: 'wrap' }}
      >
        <span>{open ? '▾' : '▸'}</span>
        <strong style={{ fontWeight: 600 }}>
          {LANGUAGE_LABEL[exam.language]} · Checkpoint {exam.checkpoint}
        </strong>
        <span style={{ color: allPassed ? 'var(--success)' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
          {exam.marked === false ? 'Checkpoint removed' : fmtPercent(exam.mark)}
        </span>
        <span style={{ color: 'var(--text-dim)', fontSize: '.8rem' }}>{STATUS_LABEL[exam.status]}</span>
        <span style={{ marginLeft: 'auto', color: 'var(--text-dim)', fontSize: '.78rem' }}>{ago(exam.startedAt)}</span>
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete report"
          title="Delete"
          style={{ background: 'transparent', color: 'var(--danger)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', padding: '.2rem .3rem', cursor: 'pointer', display: 'inline-flex', lineHeight: 0, flex: 'none' }}
        >
          <Icon name="trash" size={13} />
        </button>
      )}
      </div>
      {open && (
        <div style={{ marginTop: '.6rem', display: 'flex', flexDirection: 'column', gap: '.45rem', fontSize: '.78rem' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>
            Took {fmtSpent(examSpent(exam))} of {fmtHours(exam.minutes)} · started {new Date(exam.startedAt).toLocaleString()}
          </div>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr style={{ color: 'var(--text-dim)', fontSize: '.72rem', textAlign: 'left' }}>
                <th style={{ padding: '.25rem .4rem', fontWeight: 500 }}>Level</th>
                <th style={{ padding: '.25rem .4rem', fontWeight: 500 }}>Exercise</th>
                <th style={{ padding: '.25rem .4rem', fontWeight: 500 }}>Value</th>
                <th style={{ padding: '.25rem .4rem', fontWeight: 500 }}>Result</th>
                <th style={{ padding: '.25rem .4rem', fontWeight: 500 }}>Submits</th>
                <th style={{ padding: '.25rem .4rem', fontWeight: 500 }}>Passed after</th>
              </tr>
            </thead>
            <tbody>
              {exam.items.map((i) => (
                <tr key={i.slug} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '.35rem .4rem', fontVariantNumeric: 'tabular-nums' }}>{i.level}</td>
                  <td style={{ padding: '.35rem .4rem' }}>{i.title}</td>
                  <td style={{ padding: '.35rem .4rem', fontVariantNumeric: 'tabular-nums' }}>{i.value !== null ? fmtPercent(i.value) : '—'}</td>
                  <td style={{ padding: '.35rem .4rem', color: i.passed ? 'var(--success)' : 'var(--text-muted)' }}>{i.passed ? 'Passed' : i.submits ? 'Not passed' : 'Not tried'}</td>
                  <td style={{ padding: '.35rem .4rem', fontVariantNumeric: 'tabular-nums' }}>{i.submits}</td>
                  <td style={{ padding: '.35rem .4rem', color: 'var(--text-muted)' }}>{i.passedAt ? fmtSpent(Date.parse(i.passedAt) - Date.parse(exam.startedAt)) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </li>
  );
}

/** The mark of an exam that just ended (V4): shown once, over the exams page. */
export function ExamResult({ exam, onClose, onDashboard }: { exam: ExamView; onClose: () => void; onDashboard: () => void }) {
  const bonus = exam.mark > 100;
  const color = exam.mark >= 100 ? ['var(--accent)', 'var(--success)'] : ['#f5a524', '#e5484d'];
  return (
    <Modal open onClose={onClose} labelledBy="exam-result-title" width="min(26rem, 92vw)">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.8rem', padding: '.4rem' }}>
        <h2 id="exam-result-title" style={{ margin: 0, fontSize: '1.05rem' }}>
          {STATUS_LABEL[exam.status]} · {LANGUAGE_LABEL[exam.language]} · Checkpoint {exam.checkpoint}
        </h2>
        <MarkRing id={`exam-${exam.id}`} size={168} label={exam.marked === false ? '—' : fmtPercent(exam.mark)} caption="your mark" rings={[{ value: exam.marked === false ? 0 : exam.mark, from: color[0]!, to: color[1]! }]} />
        {bonus && <p style={{ margin: 0, color: 'var(--success)', fontSize: '.86rem' }}>Above 100%: the optional level counts on top.</p>}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, width: '100%', display: 'flex', flexDirection: 'column', gap: '.3rem', fontSize: '.85rem' }}>
          {exam.items.map((i) => (
            <li key={i.slug} style={{ display: 'flex', gap: '.6rem', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '.3rem' }}>
              <span aria-hidden style={{ color: i.passed ? 'var(--success)' : 'var(--danger)', width: '1rem' }}>{i.passed ? '✓' : '✗'}</span>
              <span style={{ color: 'var(--text-dim)', width: '3rem' }}>Level {i.level}</span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.title}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: i.passed ? 'var(--text)' : 'var(--text-dim)' }}>{i.value !== null ? fmtPercent(i.value) : '—'}</span>
            </li>
          ))}
        </ul>
        <div style={{ display: 'flex', gap: '.5rem', width: '100%', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onDashboard} style={{ ...primary, background: 'transparent', color: 'var(--text)', border: '1px solid var(--border-strong)' }}>
            Dashboard
          </button>
          <button type="button" onClick={onClose} style={primary}>
            Full report
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function Exams({ onStarted, focus, result, onResultSeen, onDashboard }: Props) {
  const [past, setPast] = useState<ExamView[] | null>(null);
  const { confirm, dialog } = useConfirm();
  async function removeExam(e: ExamView) {
    const ok = await confirm({
      title: 'Delete this exam report?',
      body: 'The report, its code and its mark are removed; the dashboard best exam is recalculated. This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.deleteExam(e.id);
      setPast((prev) => (prev ?? []).filter((x) => x.id !== e.id));
    } catch (err) {
      logger.warn('exams.delete_failed', { error: String(err) });
    }
  }
  const [language, setLanguage] = useState<Language>('go');
  const [checkpoints, setCheckpoints] = useState<{ checkpoint: string; levels: number }[]>([]);
  const [checkpoint, setCheckpoint] = useState('');
  const [hours, setHours] = useState(3);
  const minutes = Math.round(hours * 60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<number>>(() => new Set(focus ? [focus] : []));

  useEffect(() => {
    let live = true;
    api
      .exams()
      .then((r) => {
        if (!live) return;
        if (r.active) onStarted(r.active);
        setPast(r.past);
      })
      .catch((err) => {
        logger.warn('exams.load_failed', { error: String(err) });
        if (live) setPast([]);
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let live = true;
    setCheckpoints([]);
    api
      .exercises(language)
      .then((r) => {
        if (!live) return;
        const levels = new Map<string, Set<number>>();
        for (const p of r.placements) levels.set(p.checkpoint, (levels.get(p.checkpoint) ?? new Set()).add(p.level));
        const list = [...levels.entries()].map(([c, l]) => ({ checkpoint: c, levels: l.size })).sort((a, b) => a.checkpoint.localeCompare(b.checkpoint, undefined, { numeric: true }));
        setCheckpoints(list);
        setCheckpoint(list[0]?.checkpoint ?? '');
      })
      .catch((err) => logger.warn('exams.checkpoints_failed', { error: String(err) }));
    return () => {
      live = false;
    };
  }, [language]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      onStarted(await api.startExam(language, checkpoint, minutes));
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : 'The exam could not start. Try again.');
      setBusy(false);
    }
  }

  const chosen = checkpoints.find((c) => c.checkpoint === checkpoint);
  const ended = result ? past?.find((e) => e.id === result) : undefined;
  return (
    <main style={{ flex: 1, overflowY: 'auto', padding: '1.2rem 1rem 2rem' }}>
      {ended && <ExamResult exam={ended} onClose={() => onResultSeen?.()} onDashboard={() => { onResultSeen?.(); onDashboard?.(); }} />}
      <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
        <section style={{ ...panel, display: 'flex', flexDirection: 'column', gap: '.8rem' }} aria-label="Start a mock exam">
          <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Mock exam</h2>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '.86rem', lineHeight: 1.5 }}>
            One random exercise for each level of a checkpoint, from fresh starters, against the clock. Like the real exam, hints, your solutions and
            other exercises are closed until you finish. Your practice code is kept aside and comes back afterwards; exam results do not change your
            practice progress.
          </p>
          <div style={{ display: 'flex', gap: '.8rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '.25rem', fontSize: '.78rem', color: 'var(--text-muted)' }}>
              Track
              <select style={input} value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {LANGUAGE_LABEL[l]}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '.25rem', fontSize: '.78rem', color: 'var(--text-muted)' }}>
              Checkpoint
              <select style={input} value={checkpoint} onChange={(e) => setCheckpoint(e.target.value)} disabled={checkpoints.length === 0}>
                {checkpoints.map((c) => (
                  <option key={c.checkpoint} value={c.checkpoint}>
                    Checkpoint {c.checkpoint} ({c.levels} levels)
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '.25rem', fontSize: '.78rem', color: 'var(--text-muted)' }}>
              Time
              <span style={{ display: 'flex', alignItems: 'center', gap: '.35rem' }}>
                <input type="number" min={0.5} max={6} step={0.5} style={{ ...input, width: '5rem' }} value={hours} onChange={(e) => setHours(Number(e.target.value))} aria-label="Time in hours" />
                hours
              </span>
            </label>
            <button type="button" style={{ ...primary, opacity: busy || !chosen ? 0.6 : 1 }} disabled={busy || !chosen || !(hours >= 0.5 && hours <= 6)} onClick={() => void start()}>
              Start exam
            </button>
          </div>
          {error && <p style={{ margin: 0, color: 'var(--danger)', fontSize: '.84rem' }}>{error}</p>}
        </section>

        <section aria-label="Past exams" style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1rem' }}>Reports</h2>
          {!past && [0, 1].map((i) => <Skeleton key={i} height="2.6rem" />)}
          {past && past.length === 0 && <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '.86rem' }}>No mock exams yet.</p>}
          <ul style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
            {past?.map((e) => (
              <ExamReport
                key={e.id}
                exam={e}
                onDelete={() => void removeExam(e)}
                open={open.has(e.id)}
                onToggle={() =>
                  setOpen((prev) => {
                    const next = new Set(prev);
                    if (next.has(e.id)) next.delete(e.id);
                    else next.add(e.id);
                    return next;
                  })
                }
              />
            ))}
          </ul>
          {dialog}
        </section>
      </div>
    </main>
  );
}

/** Exam length in hours, as the start form sets it. */
export function fmtHours(minutes: number): string {
  const h = minutes / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} hour${h === 1 ? '' : 's'}`;
}
