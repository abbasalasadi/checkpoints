/**
 * Dashboard: one card per track with a ring of weighted progress and the best
 * exam mark (percent, D35), the exercise to resume, plus recent activity. The track
 * choice lives here (D23).
 */
import { useEffect, useState } from 'react';
import { api, type ExerciseHistory, type Language, type TrackSummary } from '../lib/api.js';
import { LANGUAGE_LABEL, ago } from '../lib/format.js';
import { resultText } from '../lib/timeline.js';
import { logger } from '../logger.js';
import { MarkRing, fmtPercent } from './MarkRing.js';
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

function Stat({ dot, label, value }: { dot: string; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.82rem' }}>
      <span style={{ width: 9, height: 9, borderRadius: 9, background: dot, flex: 'none' }} />
      <span style={{ color: 'var(--text-muted)', flex: 1 }}>{label}</span>
      <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</strong>
    </div>
  );
}

function TrackCard({ t, onOpen }: { t: TrackSummary; onOpen: Props['onOpen'] }) {
  const exam = t.bestExamMark;
  return (
    <section style={card} aria-label={`${LANGUAGE_LABEL[t.language]} track`}>
      <h2 style={{ margin: 0, fontSize: '1.05rem' }}>{LANGUAGE_LABEL[t.language]}</h2>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <MarkRing
          id={`donut-${t.language}`}
          label={fmtPercent(t.progress)}
          caption="progress"
          rings={[
            { value: t.progress, from: 'var(--accent)', to: 'var(--success)' },
            ...(exam !== null ? [{ value: exam, from: '#f5a524', to: '#e5484d' }] : []),
          ]}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.55rem', flex: 1, minWidth: 0 }}>
          <Stat dot="linear-gradient(135deg, var(--accent), var(--success))" label="Progress" value={fmtPercent(t.progress)} />
          <Stat dot="linear-gradient(135deg, #f5a524, #e5484d)" label="Best exam" value={exam !== null ? fmtPercent(exam) : '—'} />
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
            ? data.tracks.map((t) => <TrackCard key={t.language} t={t} onOpen={onOpen} />)
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
