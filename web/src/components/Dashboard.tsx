/**
 * Dashboard (V2 feature 1): one card per track with progress, the exercise to
 * resume and per-checkpoint (gate) counts, plus recent activity. The track
 * choice lives here (D23).
 */
import { useEffect, useState } from 'react';
import { api, type AttemptSummary, type Language, type TrackSummary } from '../lib/api.js';
import { LANGUAGE_LABEL, ago, kindLabel, outcomeColor, outcomeLabel } from '../lib/format.js';
import { logger } from '../logger.js';
import { Skeleton } from './Skeleton.js';

interface Props {
  onOpen: (language: Language, slug: string | null) => void;
  onHistory: () => void;
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

function Bar({ value, total, height = 6 }: { value: number; total: number; height?: number }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={total} style={{ height, background: 'var(--raised)', borderRadius: height, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: value && value === total ? 'var(--success)' : 'var(--accent)' }} />
    </div>
  );
}

function gateLabel(checkpoint: string): string {
  return `Checkpoint ${checkpoint}`;
}

function TrackCard({ t, onOpen }: { t: TrackSummary; onOpen: Props['onOpen'] }) {
  const rate = t.submits ? Math.round((t.submitsPassed / t.submits) * 100) : null;
  return (
    <section style={card} aria-label={`${LANGUAGE_LABEL[t.language]} track`}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '.5rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>{LANGUAGE_LABEL[t.language]}</h2>
        <span style={{ color: 'var(--text-muted)', fontSize: '.82rem', fontVariantNumeric: 'tabular-nums' }}>
          {t.passed} / {t.total} passed
        </span>
      </div>
      <Bar value={t.passed} total={t.total} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
        {t.gates.map((g) => (
          <div key={g.checkpoint} style={{ display: 'grid', gridTemplateColumns: '7.5rem 1fr 3.2rem', alignItems: 'center', gap: '.5rem', fontSize: '.78rem', color: 'var(--text-muted)' }}>
            <span>{gateLabel(g.checkpoint)}</span>
            <Bar value={g.passed} total={g.total} height={4} />
            <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {g.passed}/{g.total}
            </span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '1rem', fontSize: '.78rem', color: 'var(--text-dim)', flexWrap: 'wrap' }}>
        <span>{t.runs} runs</span>
        <span>{t.submits} submits</span>
        {rate !== null && <span>{rate}% of submits passed</span>}
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

export function ActivityRow({ a, onOpen }: { a: AttemptSummary; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        display: 'grid', gridTemplateColumns: '5.5rem 1fr auto auto', gap: '.7rem', alignItems: 'center', width: '100%',
        background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--text)',
        font: 'inherit', fontSize: '.84rem', textAlign: 'left', padding: '.5rem .2rem', cursor: 'pointer',
      }}
    >
      <span style={{ color: 'var(--text-dim)' }}>{LANGUAGE_LABEL[a.language]}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {a.title} <span style={{ color: 'var(--text-dim)' }}>· {kindLabel(a.kind)}</span>
      </span>
      <span style={{ color: outcomeColor(a.outcome) }}>{outcomeLabel(a.outcome, a.kind)}</span>
      <span style={{ color: 'var(--text-dim)', fontSize: '.76rem', minWidth: '4.5rem', textAlign: 'right' }}>{ago(a.at)}</span>
    </button>
  );
}

export function Dashboard({ onOpen, onHistory }: Props) {
  const [data, setData] = useState<{ tracks: TrackSummary[]; recent: AttemptSummary[] } | null>(null);
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
            : !error && [0, 1, 2].map((i) => <Skeleton key={i} height="17rem" />)}
        </div>
        <section style={{ ...card, gap: '.3rem' }} aria-label="Recent activity">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h2 style={{ margin: '0 0 .3rem', fontSize: '1rem' }}>Recent activity</h2>
            <button type="button" onClick={onHistory} style={{ ...secondary, border: 'none', color: 'var(--accent-text)', padding: 0 }}>
              All history →
            </button>
          </div>
          {!data && !error && [0, 1, 2, 3].map((i) => <Skeleton key={i} height="1.9rem" />)}
          {data && data.recent.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '.86rem', margin: '.3rem 0' }}>Nothing yet. Pick a track above and run your first exercise.</p>}
          {data?.recent.map((a) => <ActivityRow key={a.id} a={a} onOpen={() => onOpen(a.language, a.slug)} />)}
        </section>
      </div>
    </main>
  );
}
