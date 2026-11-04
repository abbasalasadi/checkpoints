/**
 * Dashboard: one card per track with a donut of exercises passed and the best
 * exam, the exercise to resume, plus recent activity. The track
 * choice lives here (D23).
 */
import { useEffect, useState } from 'react';
import { api, type ExamView, type ExerciseHistory, type Language, type TrackSummary } from '../lib/api.js';
import { LANGUAGE_LABEL, ago } from '../lib/format.js';
import { resultText } from '../lib/timeline.js';
import { logger } from '../logger.js';
import { Skeleton } from './Skeleton.js';

interface Props {
  onOpen: (language: Language, slug: string | null) => void;
  /** All history, or one exercise's timeline. */
  onHistory: (focus?: { language: Language; slug: string }) => void;
}

const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: '1rem 1.1rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '.7rem',
  minWidth: 0,
};

const primary: React.CSSProperties = {
  background: 'var(--accent)', color: '#fff', border: '1px solid var(--accent)', borderRadius: 'var(--radius)',
  padding: '.4rem .8rem', font: 'inherit', fontSize: '.84rem', cursor: 'pointer',
};
const secondary: React.CSSProperties = {
  background: 'transparent', color: 'var(--text)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)',
  padding: '.4rem .8rem', font: 'inherit', fontSize: '.84rem', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};

/** Best finished exam per track: most levels passed, then the most recent. */
export function bestExams(exams: ExamView[]): Partial<Record<Language, { passed: number; total: number }>> {
  const best: Partial<Record<Language, { passed: number; total: number }>> = {};
  for (const e of exams) {
    if (e.status === 'active') continue;
    const cur = best[e.language];
    if (!cur || e.passed > cur.passed || (e.passed === cur.passed && e.total < cur.total)) best[e.language] = { passed: e.passed, total: e.total };
  }
  return best;
}

/** Donut: the outer ring is exercises passed, the inner ring the best exam. */
function Donut({ id, passed, total, exam }: { id: string; passed: number; total: number; exam?: { passed: number; total: number } }) {
  const ring = (r: number, frac: number, stroke: string, width: number) => {
    const c = 2 * Math.PI * r;
    return (
      <>
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--raised)" strokeWidth={width} />
        <circle
          cx="60" cy="60" r={r} fill="none" stroke={stroke} strokeWidth={width} strokeLinecap="round"
          strokeDasharray={`${Math.max(frac * c, frac > 0 ? 0.01 : 0)} ${c}`}
          transform="rotate(-90 60 60)"
          style={{ transition: 'stroke-dasharray .8s ease' }}
        />
      </>
    );
  };
  const frac = total ? passed / total : 0;
  const examFrac = exam && exam.total ? exam.passed / exam.total : 0;
  const pct = Math.round(frac * 100);
  return (
    <svg viewBox="0 0 120 120" width="132" height="132" role="img" aria-label={`${passed} of ${total} exercises passed${exam ? `, best exam ${exam.passed} of ${exam.total}` : ''}`} style={{ flex: 'none' }}>
      <defs>
        <linearGradient id={`${id}-a`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="var(--success)" />
        </linearGradient>
        <linearGradient id={`${id}-b`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f5a524" />
          <stop offset="100%" stopColor="#e5484d" />
        </linearGradient>
        <filter id={`${id}-g`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.6" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <g filter={`url(#${id}-g)`}>
        {ring(50, frac, `url(#${id}-a)`, 10)}
        {exam && ring(36, examFrac, `url(#${id}-b)`, 7)}
      </g>
      <text x="60" y="58" textAnchor="middle" fontSize="20" fontWeight="700" fill="var(--text)" style={{ fontVariantNumeric: 'tabular-nums' }}>{pct}%</text>
      <text x="60" y="74" textAnchor="middle" fontSize="8.5" fill="var(--text-muted)">passed</text>
    </svg>
  );
}

function Stat({ dot, label, value }: { dot: string; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.82rem' }}>
      <span style={{ width: 9, height: 9, borderRadius: 9, background: dot, flex: 'none' }} />
      <span style={{ color: 'var(--text-muted)', flex: 1 }}>{label}</span>
      <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</strong>
    </div>
  );
}

function TrackCard({ t, exam, onOpen }: { t: TrackSummary; exam?: { passed: number; total: number }; onOpen: Props['onOpen'] }) {
  return (
    <section style={card} aria-label={`${LANGUAGE_LABEL[t.language]} track`}>
      <h2 style={{ margin: 0, fontSize: '1.05rem' }}>{LANGUAGE_LABEL[t.language]}</h2>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <Donut id={`donut-${t.language}`} passed={t.passed} total={t.total} exam={exam} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.55rem', flex: 1, minWidth: 0 }}>
          <Stat dot="linear-gradient(135deg, var(--accent), var(--success))" label="Exercises" value={String(t.total)} />
          <Stat dot="var(--success)" label="Submits passed" value={`${t.passed} / ${t.total}`} />
          <Stat dot="linear-gradient(135deg, #f5a524, #e5484d)" label="Best exam" value={exam ? `${exam.passed} / ${exam.total}` : '—'} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: '.5rem', marginTop: 'auto', flexWrap: 'wrap' }}>
        {t.resume && (
          <button
            type="button"
            style={{ ...primary, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}
            title={`${t.resume.title} · last worked on ${ago(t.resume.at)}`}
            onClick={() => onOpen(t.language, t.resume!.slug)}
          >
            Resume {t.resume.title}
          </button>
        )}
        <button type="button" style={t.resume ? secondary : primary} onClick={() => onOpen(t.language, null)}>
          {t.resume ? 'All exercises' : 'Start'}
        </button>
      </div>
    </section>
  );
}

/** One exercise worked on recently (D26): grouped like History, not one row per attempt. */
function RecentRow({ e, onTimeline, onContinue }: { e: ExerciseHistory; onTimeline: () => void; onContinue: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '.7rem', borderBottom: '1px solid var(--border)', padding: '.45rem .2rem', fontSize: '.84rem', flexWrap: 'wrap' }}>
      <button
        type="button"
        onClick={onTimeline}
        title="Show the timeline of this exercise"
        style={{ display: 'flex', alignItems: 'center', gap: '.7rem', flex: 1, minWidth: 0, background: 'transparent', border: 'none', color: 'var(--text)', font: 'inherit', textAlign: 'left', padding: 0, cursor: 'pointer' }}
      >
        <span style={{ color: 'var(--text-dim)', width: '5.5rem', flex: 'none' }}>{LANGUAGE_LABEL[e.language]}</span>
        <strong style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</strong>
        <span style={{ color: e.passed ? 'var(--success)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>{resultText(e)}</span>
        <span style={{ color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
          {e.submits} submit{e.submits === 1 ? '' : 's'}
        </span>
      </button>
      <span style={{ color: 'var(--text-dim)', fontSize: '.76rem', minWidth: '4.5rem', textAlign: 'right' }}>{ago(e.lastAt)}</span>
      <button type="button" onClick={onContinue} style={{ ...secondary, padding: '.2rem .6rem', fontSize: '.78rem' }}>
        {e.passed ? 'Open' : 'Continue'}
      </button>
    </div>
  );
}

const RECENT = 6;

export function Dashboard({ onOpen, onHistory }: Props) {
  const [data, setData] = useState<{ tracks: TrackSummary[] } | null>(null);
  const [recent, setRecent] = useState<ExerciseHistory[] | null>(null);
  const [error, setError] = useState(false);
  const [exams, setExams] = useState<ReturnType<typeof bestExams>>({});

  useEffect(() => {
    let live = true;
    api
      .dashboard()
      .then((d) => live && setData(d))
      .catch((err) => {
        logger.warn('dashboard.load_failed', { error: String(err) });
        if (live) setError(true);
      });
    api
      .historyExercises()
      .then((r) => live && setRecent(r.exercises.slice(0, RECENT)))
      .catch((err) => {
        logger.warn('dashboard.recent_failed', { error: String(err) });
        if (live) setRecent([]);
      });
    api
      .exams()
      .then((r) => live && setExams(bestExams(r.past)))
      .catch((err) => logger.warn('dashboard.exams_failed', { error: String(err) }));
    return () => {
      live = false;
    };
  }, []);

  return (
    <main style={{ flex: 1, overflowY: 'auto', padding: '1.2rem 1rem 2rem' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
        {error && <p style={{ color: 'var(--danger)' }}>The dashboard could not load. Reload the page to try again.</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
          {data
            ? data.tracks.map((t) => <TrackCard key={t.language} t={t} exam={exams[t.language]} onOpen={onOpen} />)
            : !error && [0, 1, 2].map((i) => <Skeleton key={i} height="13rem" />)}
        </div>
        <section style={{ ...card, gap: '.3rem' }} aria-label="Recent activity">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h2 style={{ margin: '0 0 .3rem', fontSize: '1rem' }}>Recent activity</h2>
            <button type="button" onClick={() => onHistory()} style={{ ...secondary, border: 'none', color: 'var(--accent-text)', padding: 0 }}>
              All history →
            </button>
          </div>
          {!recent && [0, 1, 2, 3].map((i) => <Skeleton key={i} height="1.9rem" />)}
          {recent && recent.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '.86rem', margin: '.3rem 0' }}>Nothing yet. Pick a track above and run your first exercise.</p>}
          {recent?.map((e) => (
            <RecentRow
              key={`${e.language}/${e.slug}`}
              e={e}
              onTimeline={() => onHistory({ language: e.language, slug: e.slug })}
              onContinue={() => onOpen(e.language, e.slug)}
            />
          ))}
        </section>
      </div>
    </main>
  );
}
