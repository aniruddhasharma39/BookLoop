import React from 'react';
import { Link } from 'react-router-dom';
import { BookMarked, Mail, ShieldCheck } from 'lucide-react';

export default function Footer() {
  return (
    <footer
      style={{
        marginTop: 'var(--space-8)',
        borderTop: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-card-bg)',
        padding: 'var(--space-6) 0 calc(var(--space-8) + 60px)', // extra bottom padding for mobile bottom nav
      }}
    >
      <div
        style={{
          maxWidth: '1560px',
          width: '100%',
          margin: '0 auto',
          padding: '0 clamp(16px, 3.5vw, 48px)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-5)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: 'var(--space-4)',
          }}
        >
          {/* Brand & Mission */}
          <div style={{ maxWidth: '360px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--color-primary-navy)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <BookMarked size={16} />
              </div>
              <strong style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-primary-navy)' }}>
                BookLoop
              </strong>
            </div>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', lineHeight: 1.6, margin: 0 }}>
              A campus knowledge exchange for students. Pass on the textbooks that shaped your learning, empower juniors, save paper, and keep education affordable.
            </p>
          </div>

          {/* Safety & Contact Administrator */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <strong style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-primary-navy)' }}>
              Safety & Policies
            </strong>
            <Link
              to="/rules"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textDecoration: 'none' }}
            >
              <ShieldCheck size={14} color="var(--color-success)" />
              <span style={{ textDecoration: 'underline' }}>Campus Meetup Rules & Safety</span>
            </Link>
            <div style={{ display: 'flex', gap: 'var(--space-3)', fontSize: 'var(--font-size-xs)' }}>
              <Link to="/privacy" style={{ color: 'var(--color-text-muted)' }}>
                Privacy Notice (Draft)
              </Link>
              <span style={{ color: 'var(--color-border)' }}>&bull;</span>
              <Link to="/terms" style={{ color: 'var(--color-text-muted)' }}>
                Terms of Service (Draft)
              </Link>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--font-size-xs)', marginTop: '4px' }}>
              <Mail size={14} color="var(--color-primary-navy)" />
              <span style={{ color: 'var(--color-text-muted)' }}>Contact Admin:</span>
              <a
                href="mailto:support.urbancloud@gmail.com"
                style={{ color: 'var(--color-primary-navy)', fontWeight: 600, textDecoration: 'none' }}
              >
                support.urbancloud@gmail.com
              </a>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div
          style={{
            borderTop: '1px solid var(--color-border-subtle)',
            paddingTop: 'var(--space-4)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-muted)',
          }}
        >
          <span>Knowledge Continuity &bull; Paper Saved &bull; Fair Campus Exchange</span>
        </div>
      </div>
    </footer>
  );
}

