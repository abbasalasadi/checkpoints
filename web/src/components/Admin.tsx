/**
 * Admin view (V5, D36-D39): the application's usage and performance, for admin
 * accounts only. Read-only; totals and charts, no student code or names. Same
 * cards, colours and spacing as the dashboard (D38).
 */
import { useEffect, useState } from 'react';
import { api, type AdminOverview, type AdminRange, type Language } from '../lib/api.js';
import { LANGUAGE_LABEL, ago } from '../lib/format.js';
import { logger } from '../logger.js';
import { Skeleton } from './Skeleton.js';

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
const h2: React.CSSProperties = { margin: 0, fontSize: '1rem' };
const muted: React.CSSProperties = { color: 'var(--text-muted)', fontSize: '.8rem' };
const num: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' };

const LANG_COLOR: Record<Language, string> = { go: '#00add8', js: '#e0a33a', rust: '#f0736a', java: '#a78bfa' };
const RANGE_LABEL: Record<AdminRange, string> = { today: 'Today', '7d': '7 days', '30d': '30 days' };

const fmtInt = (n: number) => n.toLocaleString('en-US');
const fmtMs = (ms: number | null) => (ms === null ? '—' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);
const fmtPct = (f: number) => `${(f * 100).toFixed(f && f < 0.01 ? 2 : 1)}%`;
const fmtBytes = (b: number) => (b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`);
function fmtUptime(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={{ ...card, gap: '.25rem', padding: '.85rem 1rem' }}>
      <span style={muted}>{label}</span>
      <strong style={{ ...num, fontSize: '1.45rem', lineHeight: 1.15 }}>{value}</strong>
      {hint && <span style={{ ...muted, fontSize: '.74rem', color: 'var(--text-dim)' }}>{hint}</span>}
    </div>
  );
}

function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div style={{ display: 'flex', gap: '.9rem', flexWrap: 'wrap', fontSize: '.78rem', color: 'var(--text-muted)' }}>
      {items.map((i) => (
        <span key={i.label} style={{ display: 'flex', alignItems: 'center', gap: '.35rem' }}>
          <span style={{ width: 9, height: 9, borderRadius: 9, background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Stacked bars: runs and submits per day. */
function DailyChart({ days }: { days: AdminOverview['usage']['days'] }) {
  const max = Math.max(1, ...days.map((d) => d.runs + d.submits));
  const w = 100 / days.length;
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" width="100%" height="160" role="img" aria-label="Runs and submits per day">
      <defs>
        <linearGradient id="adm-sub" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--success)" />
          <stop offset="100%" stopColor="var(--accent)" />
        </linearGradient>
      </defs>
      {days.map((d, i) => {
        const hs = (d.submits / max) * 38;
        const hr = (d.runs / max) * 38;
        const x = i * w + w * 0.15;
        const bw = w * 0.7;
        return (
          <g key={d.day}>
            <title>{`${d.day}: ${d.runs} runs, ${d.submits} submits`}</title>
            <rect x={x} y={40 - hs} width={bw} height={hs} rx={0.6} fill="url(#adm-sub)" />
            <rect x={x} y={40 - hs - hr} width={bw} height={hr} rx={0.6} fill="var(--border-strong)" />
          </g>
        );
      })}
    </svg>
  );
}

function HoursChart({ hours }: { hours: number[] }) {
  const max = Math.max(1, ...hours);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 90 }}>
        {hours.map((n, h) => (
          <div
            key={h}
            title={`${String(h).padStart(2, '0')}:00 UTC — ${fmtInt(n)}`}
            style={{ flex: 1, height: `${Math.max(2, (n / max) * 100)}%`, borderRadius: 3, background: n === max && n > 0 ? 'var(--accent-text)' : 'var(--accent)', opacity: n ? 1 : 0.25 }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', ...muted, fontSize: '.72rem', marginTop: '.3rem' }}>
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>23:00 UTC</span>
      </div>
    </div>
  );
}

function LanguageTable({ rows }: { rows: AdminOverview['performance']['languages'] }) {
  const th: React.CSSProperties = { textAlign: 'right', fontWeight: 500, color: 'var(--text-muted)', padding: '.35rem .5rem', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { ...num, textAlign: 'right', padding: '.45rem .5rem', borderTop: '1px solid var(--border)', whiteSpace: 'nowrap' };
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.84rem' }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }}>Language</th>
            <th style={th}>Runs</th>
            <th style={th}>Submits</th>
            <th style={th}>Typical time</th>
            <th style={th}>Slowest 5%</th>
            <th style={th}>System failures</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.language}>
              <td style={{ ...td, textAlign: 'left' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.45rem' }}>
                  <span style={{ width: 9, height: 9, borderRadius: 9, background: LANG_COLOR[r.language] }} />
                  {LANGUAGE_LABEL[r.language]}
                </span>
              </td>
              <td style={td}>{fmtInt(r.runs)}</td>
              <td style={td}>{fmtInt(r.submits)}</td>
              <td style={td}>{fmtMs(r.medianMs)}</td>
              <td style={td}>{fmtMs(r.p95Ms)}</td>
              <td style={{ ...td, color: r.systemFailureRate > 0.05 ? 'var(--danger)' : r.systemFailureRate > 0.01 ? 'var(--warning)' : 'var(--success)' }}>
                {fmtPct(r.systemFailureRate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TopExercises({ rows }: { rows: AdminOverview['usage']['topExercises'] }) {
  const max = Math.max(1, ...rows.map((r) => r.attempts));
  if (!rows.length) return <p style={{ ...muted, margin: 0 }}>No activity in this range.</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.45rem' }}>
      {rows.map((r) => (
        <div key={`${r.language}/${r.slug}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '.2rem .7rem', fontSize: '.82rem' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span style={{ color: 'var(--text-dim)' }}>{LANGUAGE_LABEL[r.language]} · </span>
            {r.slug}
          </span>
          <span style={{ ...num, color: 'var(--text-muted)' }}>
            {fmtInt(r.attempts)} · {fmtInt(r.passes)} passed
          </span>
          <div style={{ gridColumn: '1 / -1', height: 6, background: 'var(--raised)', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ width: `${(r.attempts / max) * 100}%`, height: '100%', background: LANG_COLOR[r.language], borderRadius: 6 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function RangePicker({ value, onChange }: { value: AdminRange; onChange: (r: AdminRange) => void }) {
  return (
    <div role="group" aria-label="Range" style={{ display: 'flex', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
      {(Object.keys(RANGE_LABEL) as AdminRange[]).map((r) => (
        <button
          key={r}
          type="button"
          aria-pressed={value === r}
          onClick={() => onChange(r)}
          style={{
            background: value === r ? 'var(--accent)' : 'transparent',
            color: value === r ? '#fff' : 'var(--text-muted)',
            border: 'none',
            font: 'inherit',
            fontSize: '.82rem',
            padding: '.35rem .8rem',
            cursor: 'pointer',
          }}
        >
          {RANGE_LABEL[r]}
        </button>
      ))}
    </div>
  );
}

export function Admin() {
  const [range, setRange] = useState<AdminRange>('7d');
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    setData(null);
    setError(false);
    api
      .adminOverview(range)
      .then((d) => live && setData(d))
      .catch((err) => {
        logger.warn('admin.load_failed', { error: String(err) });
        if (live) setError(true);
      });
    return () => {
      live = false;
    };
  }, [range]);

  const grid = (min: number): React.CSSProperties => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: '1rem' });
  const u = data?.usage;
  const p = data?.performance;
  const s = data?.server;

  return (
    <main style={{ flex: 1, overflowY: 'auto', padding: '1.2rem 1rem 2rem' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.2rem' }}>Admin</h1>
            <span style={muted}>Usage and performance of the application{data ? ` · updated ${ago(data.generatedAt)}` : ''}</span>
          </div>
          <RangePicker value={range} onChange={setRange} />
        </div>

        {error && <p style={{ color: 'var(--danger)', margin: 0 }}>The admin view could not load. Reload the page to try again.</p>}

        <section aria-label="Usage" style={grid(160)}>
          {u ? (
            <>
              <Tile label="Students" value={fmtInt(u.students)} hint={`${fmtInt(u.newAccounts)} new in range`} />
              <Tile label="Active today" value={fmtInt(u.activeToday)} />
              <Tile label="Active 7 days" value={fmtInt(u.active7d)} />
              <Tile label="Active 30 days" value={fmtInt(u.active30d)} />
              <Tile label="Runs" value={fmtInt(u.runs)} hint={RANGE_LABEL[range]} />
              <Tile label="Submits" value={fmtInt(u.submits)} hint={RANGE_LABEL[range]} />
            </>
          ) : (
            !error && [0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height="5.4rem" />)
          )}
        </section>

        <section style={card} aria-label="Runs and submits per day">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap' }}>
            <h2 style={h2}>Runs and submits per day</h2>
            <Legend items={[{ color: 'var(--border-strong)', label: 'Runs' }, { color: 'linear-gradient(135deg, var(--accent), var(--success))', label: 'Submits' }]} />
          </div>
          {u ? <DailyChart days={u.days} /> : <Skeleton height="10rem" />}
        </section>

        <section style={card} aria-label="Performance by language">
          <h2 style={h2}>Performance by language</h2>
          <span style={muted}>Typical time is the median run or submit; system failures are timeouts and runner errors, not wrong answers.</span>
          {p ? <LanguageTable rows={p.languages} /> : <Skeleton height="9rem" />}
        </section>

        <div style={grid(320)}>
          <section style={card} aria-label="Most used exercises">
            <h2 style={h2}>Most used exercises</h2>
            {u ? <TopExercises rows={u.topExercises} /> : <Skeleton height="12rem" />}
          </section>
          <section style={card} aria-label="Busiest hours">
            <h2 style={h2}>Busiest hours</h2>
            <span style={muted}>Runs and submits by hour of the day.</span>
            {p ? <HoursChart hours={p.busiestHours} /> : <Skeleton height="6rem" />}
          </section>
        </div>

        <div style={grid(320)}>
          <section style={card} aria-label="Mock exams">
            <h2 style={h2}>Mock exams</h2>
            {u ? (
              <div style={grid(110)}>
                <Tile label="Started" value={fmtInt(u.exams.started)} />
                <Tile label="Finished" value={fmtInt(u.exams.finished)} />
                <Tile label="Expired" value={fmtInt(u.exams.expired)} />
                <Tile label="Left early" value={fmtInt(u.exams.abandoned)} />
                <Tile label="Running now" value={fmtInt(u.exams.active)} />
              </div>
            ) : (
              <Skeleton height="6rem" />
            )}
          </section>
          <section style={card} aria-label="Server">
            <h2 style={h2}>Server</h2>
            {s ? (
              <div style={grid(110)}>
                <Tile label="Uptime" value={fmtUptime(s.uptimeSeconds)} />
                <Tile label="Memory" value={`${s.memoryMb} MB`} />
                <Tile label="Database" value={fmtBytes(s.dbSizeBytes)} />
                <Tile label="Last backup" value={s.lastBackupAt ? ago(s.lastBackupAt) : 'none'} />
              </div>
            ) : (
              <Skeleton height="6rem" />
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
