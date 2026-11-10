/**
 * Header for the pages outside the workbench (dashboard, history): who is
 * signed in, where they are, and the account actions.
 */
import { Logo } from './Icon.js';

interface Props {
  identifier: string;
  current: 'dashboard' | 'history' | 'vault' | 'exams' | 'admin';
  /** V5 (D36): the Admin button shows only for admin accounts. */
  isAdmin?: boolean;
  onAdmin?: () => void;
  onDashboard: () => void;
  onHistory: () => void;
  onVault: () => void;
  onExams: () => void;
  onAbout: () => void;
  onSignOut: () => void;
}

const link = (active: boolean): React.CSSProperties => ({
  background: 'transparent',
  border: 'none',
  font: 'inherit',
  fontSize: '.86rem',
  cursor: 'pointer',
  padding: '.3rem .55rem',
  borderRadius: 'var(--radius)',
  color: active ? 'var(--text)' : 'var(--text-muted)',
  boxShadow: active ? 'inset 0 -2px 0 var(--accent)' : 'none',
});

export function PageHeader({ identifier, current, isAdmin, onAdmin, onDashboard, onHistory, onVault, onExams, onAbout, onSignOut }: Props) {
  return (
    <header style={{ display: 'flex', alignItems: 'center', gap: '.6rem', padding: '.55rem 1rem', borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexWrap: 'wrap' }}>
      <span style={{ color: 'var(--accent-text)', display: 'flex' }}>
        <Logo size={22} />
      </span>
      <strong style={{ fontSize: '.95rem', marginRight: '.6rem' }}>Checkpoints</strong>
      <nav style={{ display: 'flex', gap: '.15rem' }}>
        <button type="button" style={link(current === 'dashboard')} aria-current={current === 'dashboard' ? 'page' : undefined} onClick={onDashboard}>
          Dashboard
        </button>
        <button type="button" style={link(current === 'history')} aria-current={current === 'history' ? 'page' : undefined} onClick={onHistory}>
          History
        </button>
        <button type="button" style={link(current === 'vault')} aria-current={current === 'vault' ? 'page' : undefined} onClick={onVault}>
          Solutions
        </button>
        <button type="button" style={link(current === 'exams')} aria-current={current === 'exams' ? 'page' : undefined} onClick={onExams}>
          Mock exam
        </button>
      </nav>
      <span style={{ marginLeft: 'auto' }} />
      {isAdmin && onAdmin && (
        <button type="button" style={link(current === 'admin')} aria-current={current === 'admin' ? 'page' : undefined} onClick={onAdmin}>
          Admin
        </button>
      )}
      <button type="button" style={link(false)} onClick={onAbout}>
        About
      </button>
      <span style={{ color: 'var(--text-muted)', fontSize: '.82rem' }}>{identifier}</span>
      <button type="button" style={link(false)} onClick={onSignOut}>
        Sign out
      </button>
    </header>
  );
}
