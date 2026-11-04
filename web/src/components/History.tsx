/**
 * History (V2 feature 2, reshaped by D26): one row per exercise, and for each
 * exercise a timeline where the runs between two submits fold into one line.
 * Every attempt is still stored and can be opened, or two submits compared.
 */
import { useEffect, useMemo, useState } from 'react';
import { api, reportUrl, type AttemptDetail, type AttemptSummary, type ExerciseHistory, type Language } from '../lib/api.js';
import { LANGUAGES } from '../lib/route.js';
import { LANGUAGE_LABEL, ago, kindLabel, outcomeColor, outcomeLabel } from '../lib/format.js';
import { fmtSpent, groupTimeline, resultText, lineDiff, runLabel, summariseRuns, type TimelineItem } from '../lib/timeline.js';
import { logger } from '../logger.js';
import { Skeleton } from './Skeleton.js';

interface Props {
  onOpen: (language: Language, slug: string) => void;
  /** Open straight on this exercise's timeline (from the dashboard). */
  focus?: { language: Language; slug: string } | null;
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

function Detail({ id, onClose }: { id: number; onClose: () => void }) {
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
        <span style={{ color: 'var(--text-dim)', fontSize: '.8rem' }}>
          {LANGUAGE_LABEL[a.language]} · {kindLabel(a.kind)} · {new Date(a.at).toLocaleString()}
          {a.durationMs != null ? ` · ${(a.durationMs / 1000).toFixed(1)} s` : ''}
        </span>
        <span style={{ color: outcomeColor(a.outcome), fontSize: '.85rem' }}>{outcomeLabel(a.outcome, a.kind)}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: '.4rem' }}>
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

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const day = (iso: string) => new Date(iso).toLocaleDateString();

/** Two submits side by side as one line diff per file: what changed between them. */
function Compare({ from, to, onClose }: { from: number; to: number; onClose: () => void }) {
  const [pair, setPair] = useState<[AttemptDetail, AttemptDetail] | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all([api.attempt(from), api.attempt(to)])
      .then((p) => live && setPair(p))
      .catch((err) => logger.warn('history.compare_failed', { error: String(err) }));
    return () => {
      live = false;
    };
  }, [from, to]);
  if (!pair) return <div style={panel}><Skeleton height="10rem" /></div>;
  const [a, b] = pair;
  const names = [...new Set([...Object.keys(a.files), ...Object.keys(b.files)])].filter((n) => a.files[n] !== b.files[n]);
  return (
    <section style={{ ...panel, display: 'flex', flexDirection: 'column', gap: '.6rem' }} aria-label="Compare submits">
      <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
        <span style={{ fontSize: '.85rem' }}>What changed between these two submits</span>
        <button type="button" style={{ ...btn, marginLeft: 'auto' }} onClick={onClose}>Close</button>
      </div>
      {names.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '.84rem', margin: 0 }}>No code changes (or the code was not recorded).</p>}
      {names.map((n) => (
        <div key={n}>
          <div style={{ color: 'var(--text-muted)', fontSize: '.78rem', marginBottom: '.3rem' }}>{n}</div>
          <pre style={pre}>
            {lineDiff(a.files[n] ?? '', b.files[n] ?? '').map((l, i) => (
              <div
                key={i}
                style={{
                  background: l.op === '+' ? 'rgba(34,197,94,.14)' : l.op === '-' ? 'rgba(239,68,68,.14)' : 'transparent',
                  color: l.op === ' ' ? 'var(--text-muted)' : 'var(--text)',
                }}
              >
                {l.op} {l.text}
              </div>
            ))}
          </pre>
        </div>
      ))}
    </section>
  );
}

type Open = { kind: 'view'; id: number } | { kind: 'compare'; from: number; to: number } | null;

function Item({ item, open, setOpen }: { item: TimelineItem; open: Open; setOpen: (o: Open) => void }) {
  const [expanded, setExpanded] = useState(false);
  const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap', padding: '.35rem 0' };
  const viewing = (id: number) => open?.kind === 'view' && open.id === id;

  if (item.type === 'runs') {
    const first = item.attempts[0]!;
    const last = item.attempts[item.attempts.length - 1]!;
    return (
      <li style={{ listStyle: 'none', borderLeft: '2px solid var(--border)', paddingLeft: '.8rem' }}>
        <div style={row}>
          <span style={{ color: 'var(--text-dim)', fontSize: '.78rem', width: '7.5rem' }}>
            {time(first.at)}{item.attempts.length > 1 ? `–${time(last.at)}` : ''}
          </span>
          <button type="button" aria-expanded={expanded} onClick={() => setExpanded((e) => !e)} style={{ ...btn, border: 'none', padding: 0, color: 'var(--text-muted)' }}>
            {expanded ? '▾' : '▸'} {item.attempts.length} run{item.attempts.length > 1 ? 's' : ''}
          </button>
          <span style={{ color: 'var(--text-dim)', fontSize: '.8rem' }}>({summariseRuns(item.attempts)})</span>
        </div>
        {expanded && (
          <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
            {item.attempts.map((r) => (
              <li key={r.id} style={{ listStyle: 'none' }}>
                <div style={{ ...row, padding: '.15rem 0' }}>
                  <span style={{ color: 'var(--text-dim)', fontSize: '.76rem', width: '3.5rem' }}>{time(r.at)}</span>
                  <span style={{ fontSize: '.8rem', color: r.outcome === 'passed' || r.outcome === null ? 'var(--text-muted)' : 'var(--warning)' }}>{runLabel(r.outcome)}</span>
                  <button type="button" style={{ ...btn, padding: '.1rem .5rem', fontSize: '.75rem' }} onClick={() => setOpen(viewing(r.id) ? null : { kind: 'view', id: r.id })}>
                    {viewing(r.id) ? 'Hide' : 'View'}
                  </button>
                </div>
                {viewing(r.id) && <Detail id={r.id} onClose={() => setOpen(null)} />}
              </li>
            ))}
          </ul>
        )}
      </li>
    );
  }

  const a = item.attempt;
  const ok = a.outcome === 'passed';
  const comparing = open?.kind === 'compare' && open.to === a.id;
  return (
    <li style={{ listStyle: 'none', borderLeft: `2px solid ${ok ? 'var(--success)' : 'var(--danger)'}`, paddingLeft: '.8rem' }}>
      <div style={row}>
        <span style={{ color: 'var(--text-dim)', fontSize: '.78rem', width: '7.5rem' }}>{time(a.at)}</span>
        <strong style={{ fontSize: '.86rem', color: outcomeColor(a.outcome) }}>
          {ok ? '✓' : '✗'} Submit {item.n} — {outcomeLabel(a.outcome, 'test')}
        </strong>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: '.35rem' }}>
          <button type="button" style={{ ...btn, padding: '.15rem .55rem', fontSize: '.76rem' }} onClick={() => setOpen(viewing(a.id) ? null : { kind: 'view', id: a.id })}>
            {viewing(a.id) ? 'Hide' : 'View code'}
          </button>
          {item.previous && (
            <button
              type="button"
              style={{ ...btn, padding: '.15rem .55rem', fontSize: '.76rem' }}
              onClick={() => setOpen(comparing ? null : { kind: 'compare', from: item.previous!.id, to: a.id })}
            >
              {comparing ? 'Hide changes' : 'Compare with previous'}
            </button>
          )}
        </span>
      </div>
      {viewing(a.id) && <Detail id={a.id} onClose={() => setOpen(null)} />}
      {comparing && open?.kind === 'compare' && <Compare from={open.from} to={open.to} onClose={() => setOpen(null)} />}
    </li>
  );
}


function Timeline({ ex, onOpen, onBack }: { ex: ExerciseHistory; onOpen: Props['onOpen']; onBack: () => void }) {
  const [items, setItems] = useState<TimelineItem[] | null>(null);
  const [open, setOpen] = useState<Open>(null);
  useEffect(() => {
    let live = true;
    api
      .timeline(ex.language, ex.slug)
      .then((r) => live && setItems(groupTimeline(r.attempts)))
      .catch((err) => {
        logger.warn('history.timeline_failed', { error: String(err) });
        if (live) setItems([]);
      });
    return () => {
      live = false;
    };
  }, [ex.language, ex.slug]);

  // Day headings: a timeline over several days is otherwise ambiguous.
  const withDays = useMemo(() => {
    const out: (TimelineItem | string)[] = [];
    let last = '';
    for (const it of items ?? []) {
      const d = day(it.type === 'runs' ? it.attempts[0]!.at : it.attempt.at);
      if (d !== last) out.push(d);
      last = d;
      out.push(it);
    }
    return out;
  }, [items]);

  return (
    <section style={{ ...panel, display: 'flex', flexDirection: 'column', gap: '.7rem' }} aria-label="Exercise timeline">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '.6rem', flexWrap: 'wrap' }}>
        <button type="button" style={{ ...btn, border: 'none', padding: 0, color: 'var(--accent-text)' }} onClick={onBack}>← All exercises</button>
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>{ex.title}</h2>
        <span style={{ color: 'var(--text-dim)', fontSize: '.8rem' }}>{LANGUAGE_LABEL[ex.language]}</span>
        <span style={{ color: ex.passed ? 'var(--success)' : 'var(--text-muted)', fontSize: '.85rem' }}>{resultText(ex)}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: '.4rem' }}>
          <button type="button" style={btn} onClick={() => onOpen(ex.language, ex.slug)}>Open exercise</button>
          <a style={{ ...btn, textDecoration: 'none' }} href={reportUrl(ex.language, ex.slug)} download={`${ex.language}-${ex.slug}.md`}>Export report</a>
        </span>
      </div>
      <div style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>
        {ex.runs} run{ex.runs === 1 ? '' : 's'} · {ex.submits} submit{ex.submits === 1 ? '' : 's'} · about {fmtSpent(ex.activeMs)} of work
      </div>
      {items === null && <Skeleton height="8rem" />}
      <ul style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '.15rem' }}>
        {withDays.map((it, i) =>
          typeof it === 'string' ? (
            <li key={`d${i}`} style={{ listStyle: 'none', color: 'var(--text-dim)', fontSize: '.74rem', margin: '.5rem 0 .1rem' }}>{it}</li>
          ) : (
            <Item key={it.type === 'runs' ? `r${it.attempts[0]!.id}` : `s${it.attempt.id}`} item={it} open={open} setOpen={setOpen} />
          ),
        )}
      </ul>
    </section>
  );
}

type ResultFilter = '' | 'passed' | 'not_passed';

export function History({ onOpen, focus }: Props) {
  const [language, setLanguage] = useState<Language | ''>('');
  const [result, setResult] = useState<ResultFilter>('');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<ExerciseHistory[] | null>(null);
  const [selected, setSelected] = useState<ExerciseHistory | null>(null);

  useEffect(() => {
    let live = true;
    setRows(null);
    api
      .historyExercises(language || undefined)
      .then((r) => {
        if (!live) return;
        setRows(r.exercises);
        if (focus) setSelected((cur) => cur ?? r.exercises.find((e) => e.language === focus.language && e.slug === focus.slug) ?? null);
      })
      .catch((err) => {
        logger.warn('history.load_failed', { error: String(err) });
        if (live) setRows([]);
      });
    return () => {
      live = false;
    };
  }, [language]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows ?? []).filter(
      (e) => (!result || (result === 'passed') === e.passed) && (!needle || e.title.toLowerCase().includes(needle) || e.slug.includes(needle)),
    );
  }, [rows, result, q]);

  const cell: React.CSSProperties = { padding: '.45rem .5rem', fontSize: '.83rem', borderTop: '1px solid var(--border)', whiteSpace: 'nowrap' };

  return (
    <main style={{ flex: 1, overflowY: 'auto', padding: '1.2rem 1rem 2rem' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {selected ? (
          <Timeline ex={selected} onOpen={onOpen} onBack={() => setSelected(null)} />
        ) : (
          <>
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }} aria-label="Filters">
              <select aria-label="Track" style={select} value={language} onChange={(e) => setLanguage(e.target.value as Language | '')}>
                <option value="">All tracks</option>
                {LANGUAGES.map((l) => <option key={l} value={l}>{LANGUAGE_LABEL[l]}</option>)}
              </select>
              <select aria-label="Result" style={select} value={result} onChange={(e) => setResult(e.target.value as ResultFilter)}>
                <option value="">Any result</option>
                <option value="passed">Passed</option>
                <option value="not_passed">Not passed yet</option>
              </select>
              <input aria-label="Search exercises" placeholder="Search…" style={select} value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <section style={{ ...panel, padding: '.3rem .5rem', overflowX: 'auto' }} aria-label="Exercises">
              {rows === null && [0, 1, 2, 3].map((i) => <div key={i} style={{ margin: '.4rem 0' }}><Skeleton height="1.9rem" /></div>)}
              {rows?.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '.86rem', margin: '.5rem' }}>No attempts yet. Run or submit an exercise and it will appear here.</p>}
              {rows && rows.length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: 'var(--text-dim)', fontSize: '.75rem', textAlign: 'left' }}>
                      <th style={{ padding: '.4rem .5rem', fontWeight: 500 }}>Exercise</th>
                      <th style={{ padding: '.4rem .5rem', fontWeight: 500 }}>Track</th>
                      <th style={{ padding: '.4rem .5rem', fontWeight: 500 }}>Result</th>
                      <th style={{ padding: '.4rem .5rem', fontWeight: 500 }}>Runs</th>
                      <th style={{ padding: '.4rem .5rem', fontWeight: 500 }}>Submits</th>
                      <th style={{ padding: '.4rem .5rem', fontWeight: 500 }}>Time spent</th>
                      <th style={{ padding: '.4rem .5rem', fontWeight: 500 }}>Last activity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((e) => (
                      <tr key={`${e.language}/${e.slug}`} onClick={() => setSelected(e)} style={{ cursor: 'pointer' }} className="cp-history-row">
                        <td style={cell}>
                          <button type="button" style={{ ...btn, border: 'none', padding: 0, fontWeight: 600 }} onClick={(ev) => { ev.stopPropagation(); setSelected(e); }}>
                            {e.title}
                          </button>
                        </td>
                        <td style={{ ...cell, color: 'var(--text-muted)' }}>{LANGUAGE_LABEL[e.language]}</td>
                        <td style={{ ...cell, color: e.passed ? 'var(--success)' : 'var(--text-muted)' }}>{resultText(e)}</td>
                        <td style={cell}>{e.runs}</td>
                        <td style={cell}>{e.submits}</td>
                        <td style={{ ...cell, color: 'var(--text-muted)' }}>{fmtSpent(e.activeMs)}</td>
                        <td style={{ ...cell, color: 'var(--text-muted)' }}>{ago(e.lastAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {rows && rows.length > 0 && shown.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '.86rem', margin: '.5rem' }}>Nothing matches.</p>}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
