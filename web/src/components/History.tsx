/**
 * History explorer (V2 feature 2): every Run and Submit, newest first, with
 * filters, and the code and output of any one attempt.
 */
import { useCallback, useEffect, useState } from 'react';
import { api, type AttemptDetail, type AttemptSummary, type ExerciseSummary, type HistoryFilter, type Language } from '../lib/api.js';
import { LANGUAGES } from '../lib/route.js';
import { LANGUAGE_LABEL, OUTCOMES, kindLabel, outcomeColor, outcomeLabel } from '../lib/format.js';
import { logger } from '../logger.js';
import { ActivityRow } from './Dashboard.js';
import { Skeleton } from './Skeleton.js';

interface Props {
  onOpen: (language: Language, slug: string) => void;
}

const select: React.CSSProperties = {
  background: 'var(--raised)', color: 'var(--text)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)',
  padding: '.3rem .45rem', font: 'inherit', fontSize: '.82rem', maxWidth: '100%',
};
const panel: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '.8rem 1rem', minWidth: 0,
};
const pre: React.CSSProperties = {
  background: 'var(--code-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '.6rem .7rem',
  margin: 0, fontSize: '.78rem', lineHeight: 1.5, overflow: 'auto', maxHeight: '22rem', whiteSpace: 'pre',
};
const btn: React.CSSProperties = {
  background: 'transparent', color: 'var(--text)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)',
  padding: '.35rem .8rem', font: 'inherit', fontSize: '.82rem', cursor: 'pointer',
};

function Detail({ id, onOpen, onClose }: { id: number; onOpen: Props['onOpen']; onClose: () => void }) {
  const [a, setA] = useState<AttemptDetail | null>(null);
  const [file, setFile] = useState('');
  useEffect(() => {
    let live = true;
    setA(null);
    api
      .attempt(id)
      .then((d) => {
        if (!live) return;
        setA(d);
        setFile(Object.keys(d.files)[0] ?? '');
      })
      .catch((err) => logger.warn('history.detail_failed', { error: String(err) }));
    return () => {
      live = false;
    };
  }, [id]);

  if (!a) return <div style={panel}><Skeleton height="14rem" /></div>;
  const names = Object.keys(a.files);
  return (
    <section style={{ ...panel, display: 'flex', flexDirection: 'column', gap: '.7rem' }} aria-label="Attempt detail">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '.6rem', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>{a.title}</h2>
        <span style={{ color: 'var(--text-dim)', fontSize: '.8rem' }}>
          {LANGUAGE_LABEL[a.language]} · {kindLabel(a.kind)} · {new Date(a.at).toLocaleString()}
          {a.durationMs != null ? ` · ${(a.durationMs / 1000).toFixed(1)} s` : ''}
        </span>
        <span style={{ color: outcomeColor(a.outcome), fontSize: '.85rem' }}>{outcomeLabel(a.outcome, a.kind)}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: '.4rem' }}>
          <button type="button" style={btn} onClick={() => onOpen(a.language, a.slug)}>Open exercise</button>
          <button type="button" style={btn} onClick={onClose}>Close</button>
        </span>
      </div>
      {names.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '.84rem', margin: 0 }}>The code of this attempt was not recorded (older attempts from the previous testers).</p>
      ) : (
        <div>
          <div role="tablist" style={{ display: 'flex', gap: '.3rem', marginBottom: '.4rem', flexWrap: 'wrap' }}>
            {names.map((n) => (
              <button key={n} type="button" role="tab" aria-selected={n === file} onClick={() => setFile(n)} style={{ ...btn, padding: '.2rem .55rem', fontSize: '.76rem', background: n === file ? 'var(--raised)' : 'transparent' }}>
                {n}
              </button>
            ))}
          </div>
          <pre style={pre}>{a.files[file] ?? ''}</pre>
        </div>
      )}
      <div>
        <div style={{ color: 'var(--text-muted)', fontSize: '.78rem', marginBottom: '.3rem' }}>Output</div>
        <pre style={{ ...pre, maxHeight: '16rem' }}>{a.output ? a.output.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '') : '(no output recorded)'}</pre>
      </div>
    </section>
  );
}

export function History({ onOpen }: Props) {
  const [filter, setFilter] = useState<HistoryFilter>({});
  const [rows, setRows] = useState<AttemptSummary[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exercises, setExercises] = useState<ExerciseSummary[]>([]);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    setRows(null);
    api
      .history({ ...filter, limit: 50 })
      .then((r) => {
        if (!live) return;
        setRows(r.attempts);
        setNext(r.next);
      })
      .catch((err) => {
        logger.warn('history.load_failed', { error: String(err) });
        if (live) setRows([]);
      });
    return () => {
      live = false;
    };
  }, [filter]);

  // The exercise filter lists the chosen track's exercises.
  useEffect(() => {
    if (!filter.language) {
      setExercises([]);
      return;
    }
    let live = true;
    api
      .exercises(filter.language)
      .then((r) => live && setExercises(r.exercises))
      .catch(() => live && setExercises([]));
    return () => {
      live = false;
    };
  }, [filter.language]);

  const more = useCallback(() => {
    if (!next) return;
    setLoadingMore(true);
    api
      .history({ ...filter, limit: 50, before: next })
      .then((r) => {
        setRows((prev) => [...(prev ?? []), ...r.attempts]);
        setNext(r.next);
      })
      .catch((err) => logger.warn('history.more_failed', { error: String(err) }))
      .finally(() => setLoadingMore(false));
  }, [filter, next]);

  const set = (patch: Partial<HistoryFilter>) => setFilter((f) => ({ ...f, ...patch }));

  return (
    <main style={{ flex: 1, overflowY: 'auto', padding: '1.2rem 1rem 2rem' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }} aria-label="Filters">
          <select aria-label="Track" style={select} value={filter.language ?? ''} onChange={(e) => set({ language: (e.target.value || undefined) as Language | undefined, slug: undefined })}>
            <option value="">All tracks</option>
            {LANGUAGES.map((l) => <option key={l} value={l}>{LANGUAGE_LABEL[l]}</option>)}
          </select>
          <select aria-label="Exercise" style={select} value={filter.slug ?? ''} disabled={!filter.language} onChange={(e) => set({ slug: e.target.value || undefined })}>
            <option value="">{filter.language ? 'All exercises' : 'Pick a track first'}</option>
            {exercises.map((x) => <option key={x.slug} value={x.slug}>{x.title}</option>)}
          </select>
          <select aria-label="Kind" style={select} value={filter.kind ?? ''} onChange={(e) => set({ kind: (e.target.value || undefined) as HistoryFilter['kind'] })}>
            <option value="">Runs and submits</option>
            <option value="run">Runs</option>
            <option value="test">Submits</option>
          </select>
          <select aria-label="Result" style={select} value={filter.outcome ?? ''} onChange={(e) => set({ outcome: e.target.value || undefined })}>
            <option value="">Any result</option>
            {OUTCOMES.map((o) => <option key={o} value={o}>{outcomeLabel(o, 'test')}</option>)}
          </select>
          {Object.values(filter).some(Boolean) && (
            <button type="button" style={{ ...btn, border: 'none', color: 'var(--accent-text)' }} onClick={() => setFilter({})}>Clear filters</button>
          )}
        </div>

        {selected !== null && <Detail id={selected} onOpen={onOpen} onClose={() => setSelected(null)} />}

        <section style={panel} aria-label="Attempts">
          {rows === null && [0, 1, 2, 3, 4, 5].map((i) => <div key={i} style={{ marginBottom: '.35rem' }}><Skeleton height="1.9rem" /></div>)}
          {rows?.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '.86rem', margin: '.3rem 0' }}>No attempts match these filters.</p>}
          {rows?.map((a) => (
            <ActivityRow
              key={a.id}
              a={a}
              onOpen={() => {
                setSelected(a.id);
                document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          ))}
          {next && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '.7rem' }}>
              <button type="button" style={btn} disabled={loadingMore} onClick={more}>{loadingMore ? 'Loading…' : 'Load more'}</button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
