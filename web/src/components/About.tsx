/**
 * About.
 *
 * Who made this, why it exists, and how to reach them — plus a word of
 * encouragement, since the people reading it are usually mid-exam.
 */
import { Modal } from './Modal.js';
import { Logo } from './Icon.js';

const DISCORD_HANDLE = 'abbhasan';

/**
 * Discord's profile URL takes a numeric snowflake, not a handle — there is no
 * `discord.com/users/<name>` form. While this is null the panel shows the
 * handle as plain text rather than linking somewhere that would 404.
 *
 * To enable the direct link: in Discord, User Settings → Advanced → Developer
 * Mode, then right-click your own avatar → Copy User ID, and paste it below.
 */
const DISCORD_USER_ID: string | null = null;

interface Props {
  open: boolean;
  onClose: () => void;
}

export function About({ open, onClose }: Props) {
  return (
    <Modal open={open} onClose={onClose} labelledBy="about-title" width="min(30rem, 92vw)">
      <div style={{ padding: '1.6rem 1.5rem 1.2rem' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: '.85rem', marginBottom: '1.1rem' }}>
          <span style={{ color: 'var(--accent-text)', flex: 'none' }}>
            <Logo size={44} />
          </span>
          <div>
            <h2 id="about-title" style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600 }}>
              Rust Checkpoints
            </h2>
            <p style={{ margin: '.15rem 0 0', color: 'var(--text-dim)', fontSize: '.8rem' }}>
              A practice environment for the reboot01 Rust piscine
            </p>
          </div>
        </header>

        <div style={{ color: 'var(--text-muted)', fontSize: '.88rem', lineHeight: 1.65 }}>
          <p style={{ margin: '0 0 .85rem' }}>
            Write your solution, run it, and submit it against the same tests used in the
            checkpoints — all from the browser, with nothing to install.
          </p>
          <p style={{ margin: '0 0 .85rem' }}>
            This is a voluntary project, built to help my fellow students prepare. It is free to
            use and always will be.
          </p>
          <p style={{ margin: 0, color: 'var(--text)' }}>
            Good luck in your exams — I hope it serves you well.
          </p>
        </div>

        {/* Set apart from the body copy: a disclaimer that reads as another
            paragraph is one people skim past. */}
        <section
          aria-label="Disclaimer"
          style={{
            marginTop: '1.25rem',
            padding: '.8rem .95rem',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderLeft: '3px solid var(--warning)',
            borderRadius: 'var(--radius)',
            color: 'var(--text-muted)',
            fontSize: '.82rem',
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: 'var(--text)', fontWeight: 600 }}>
            This is not an official Reboot application.
          </strong>{' '}
          It is a personal effort to help fellow students, built and maintained independently.
          The exercises follow the Reboot checkpoint list as updated in April 2026, so they may
          not reflect any later changes — always treat the official material as the authority.
        </section>

        <section
          style={{
            marginTop: '1.25rem',
            padding: '.9rem 1rem',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
          }}
        >
          <p style={{ margin: 0, fontSize: '.72rem', letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>
            Developer
          </p>
          <p style={{ margin: '.3rem 0 .1rem', fontWeight: 600, fontSize: '.95rem' }}>Abbas Al-Asadi</p>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '.84rem' }}>@{DISCORD_HANDLE}</p>
          <p style={{ margin: '.5rem 0 0', color: 'var(--text-muted)', fontSize: '.84rem' }}>
            Student at{' '}
            <a
              href="https://reboot01.com/"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--accent-text)' }}
            >
              Reboot Coding Institute
            </a>{' '}
            — Bahrain
          </p>

          {DISCORD_USER_ID && (
            <div style={{ marginTop: '.8rem' }}>
              <a
                href={`https://discord.com/users/${DISCORD_USER_ID}`}
                target="_blank"
                rel="noopener noreferrer"
                className="dlg-btn dlg-btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '.45rem', textDecoration: 'none' }}
              >
                Message me on Discord
              </a>
            </div>
          )}
        </section>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.2rem' }}>
          <button type="button" onClick={onClose} className="dlg-btn dlg-btn-quiet">
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
