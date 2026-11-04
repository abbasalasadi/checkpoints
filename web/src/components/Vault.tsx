/**
 * Solutions vault (V2 feature 3): the last passing copy of every exercise the
 * student has solved, across tracks, with a per-exercise Markdown report (D22).
 */
import { useEffect, useMemo, useState } from 'react';
import { api, reportUrl, type Language, type VaultItem } from '../lib/api.js';
import { LANGUAGE_LABEL, ago } from '../lib/format.js';
import { LANGUAGES } from '../lib/route.js';
import { logger } from '../logger.js';
import { Skeleton } from './Skeleton.js';
import { useConfirm } from './Dialog.js';
import { Icon } from './Icon.js';

interface Props {
  onOpen: (language: Language, slug: string) => void;
}

const panel: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '.8rem 1rem', minWidth: 0,
};
const pre: React.CSSProperties = {
  background: 'var(--code-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '.6rem .7rem',
  margin: 0, fontSize: '.78rem', lineHeight: 1.5, overflow: 'auto', maxHeight: '22rem', whiteSpace: 'pre',
};
const btn: React.CSSProperties = {
  background: 'transparent', color: 'var(--text)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)',
  padding: '.3rem .7rem', font: 'inherit', fontSize: '.8rem', cursor: 'pointer', textDecoration: 'none',
};
const iconBtn: React.CSSProperties = {
  background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)',
  padding: '.3rem .4rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', lineHeight: 0, textDecoration: 'none',
};
const input: React.CSSProperties = {
  background: 'var(--raised)', color: 'var(--text)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)',
  padding: '.3rem .5rem', font: 'inherit', fontSize: '.82rem', maxWidth: '100%',
};

function Item({ item, onOpen, onDelete }: { item: VaultItem; onOpen: Props['onOpen']; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const names = Object.keys(item.files);
  const [file, setFile] = useState(names[0] ?? '');
  return (
    <li style={{ ...panel, listStyle: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} style={{ ...btn, border: 'none', padding: 0, fontWeight: 600 }}>
          {open ? '▾' : '▸'} {item.title}
        </button>
        <span style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>
          {LANGUAGE_LABEL[item.language]} · passed {ago(item.passedAt)}
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: '.4rem' }}>
          <button type="button" style={iconBtn} onClick={() => onOpen(item.language, item.slug)} aria-label="Open" title="Open">
            <Icon name="open" size={15} />
          </button>
          <a style={iconBtn} href={reportUrl(item.language, item.slug)} download={`${item.language}-${item.slug}.md`} aria-label="Export report" title="Export report">
            <Icon name="download" size={15} />
          </a>
          <button type="button" style={{ ...iconBtn, color: 'var(--danger)' }} onClick={onDelete} aria-label="Delete solution" title="Delete">
            <Icon name="trash" size={15} />
          </button>
        </span>
      </div>
      {open && (
        <div style={{ marginTop: '.6rem' }}>
          {names.length > 1 && (
            <div style={{ display: 'flex', gap: '.3rem', marginBottom: '.4rem' }}>
              {names.map((n) => (
                <button key={n} type="button" onClick={() => setFile(n)} style={{ ...btn, padding: '.15rem .5rem', fontSize: '.75rem', background: n === file ? 'var(--raised)' : 'transparent' }}>
                  {n}
                </button>
              ))}
            </div>
          )}
          <pre style={pre}>{item.files[file] ?? ''}</pre>
        </div>
      )}
    </li>
  );
}

export function Vault({ onOpen }: Props) {
  const [items, setItems] = useState<VaultItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [lang, setLang] = useState<Language | ''>('');
  const [q, setQ] = useState('');
  const { confirm, dialog } = useConfirm();

  async function remove(i: VaultItem) {
    const ok = await confirm({
      title: 'Delete this solution?',
      body: `The saved passing copy of ${i.title} is deleted. The exercise stays passed. This cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.deleteSolution(i.language, i.slug);
      setItems((prev) => (prev ?? []).filter((x) => !(x.language === i.language && x.slug === i.slug)));
    } catch (err) {
      logger.warn('vault.delete_failed', { error: String(err) });
    }
  }

  useEffect(() => {
    let live = true;
    api
      .vault()
      .then((r) => live && setItems(r.items))
      .catch((err) => {
        logger.warn('vault.load_failed', { error: String(err) });
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, []);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (items ?? []).filter((i) => (!lang || i.language === lang) && (!needle || i.title.toLowerCase().includes(needle) || i.slug.includes(needle)));
  }, [items, lang, q]);

  return (
    <main style={{ flex: 1, overflow: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '.8rem', maxWidth: 1100, width: '100%', margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <h1 style={{ fontSize: '1.05rem', margin: 0, marginRight: 'auto' }}>Solutions</h1>
        <select aria-label="Track" style={input} value={lang} onChange={(e) => setLang(e.target.value as Language | '')}>
          <option value="">All tracks</option>
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {LANGUAGE_LABEL[l]}
            </option>
          ))}
        </select>
        <input aria-label="Search solutions" placeholder="Search…" style={input} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {failed && <p style={{ color: 'var(--danger, #f87171)' }}>Could not load your solutions. Try again in a moment.</p>}
      {!items && !failed && [0, 1, 2].map((k) => <Skeleton key={k} height="2.6rem" />)}
      {items && shown.length === 0 && (
        <p style={{ color: 'var(--text-muted)' }}>{items.length === 0 ? 'No passing solutions yet. Submit an exercise and it will appear here.' : 'Nothing matches.'}</p>
      )}
      <ul style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
        {shown.map((i) => (
          <Item key={`${i.language}/${i.slug}`} item={i} onOpen={onOpen} onDelete={() => void remove(i)} />
        ))}
      </ul>
      {dialog}
    </main>
  );
}
