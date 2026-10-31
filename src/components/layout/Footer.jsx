import React from 'react';
import { Link } from 'react-router-dom';
import { BookMarked, Mail, ShieldCheck, Heart, MapPin, Search, PlusCircle, ArrowRight } from 'lucide-react';

export default function Footer() {
  return (
    <footer
      style={{
        marginTop: 'var(--space-12)',
        borderTop: '1px solid var(--color-border)',
        backgroundColor: '#FFFFFF',
        padding: 'var(--space-8) 0 calc(var(--space-8) + 60px)', // safe bottom space for mobile bottom nav
      }}
    >
      <div
        style={{
          maxWidth: '1240px',
          width: '100%',
          margin: '0 auto',
          padding: '0 var(--space-6)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-8)',
        }}
      >
        {/* 4-Column Balanced Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
            gap: 'var(--space-8)',
          }}
        >
          {/* Column 1: Brand & Campus Mission */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', textDecoration: 'none' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--color-primary-navy)',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <BookMarked size={18} />
              </div>
              <strong style={{ fontSize: 'var(--font-size-lg)', fontWeight: 800, color: 'var(--color-primary-navy)' }}>
                BookLoop
              </strong>
            </Link>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', lineHeight: 1.6, margin: 0 }}>
              The student-to-student textbook exchange for Pune schools and colleges. Find the books you need, pass yours on to juniors, and keep education affordable.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 'var(--space-1)' }}>
              <MapPin size={14} color="var(--color-primary-navy)" />
              <span>Pilot City: Pune, Maharashtra</span>
            </div>
          </div>

          {/* Column 2: Quick Links */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <strong style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-primary-navy)', marginBottom: 'var(--space-1)' }}>
              Marketplace
            </strong>
            <Link to="/search" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textDecoration: 'none' }}>
              Find Textbooks
            </Link>
            <Link to="/listings/new" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textDecoration: 'none' }}>
              Sell a Textbook
            </Link>
            <Link to="/requests" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textDecoration: 'none' }}>
              Track Handover Requests
            </Link>
            <Link to="/profile" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textDecoration: 'none' }}>
              Student Profile & Listings
            </Link>
          </div>

          {/* Column 3: Popular Categories */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <strong style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-primary-navy)', marginBottom: 'var(--space-1)' }}>
              Top Categories
            </strong>
            <Link to="/search?category=Engineering%20%26%20Tech" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textDecoration: 'none' }}>
              Engineering & Tech
            </Link>
            <Link to="/search?category=Medical%20%26%20Health%20Sciences" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textDecoration: 'none' }}>
              Medical & Health Sciences
            </Link>
            <Link to="/search?category=School%20Boards%20(CBSE%20%2F%20ICSE%20%2F%20State)" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textDecoration: 'none' }}>
              School Boards (CBSE / ICSE)
            </Link>
            <Link to="/search?category=Competitive%20Exams%20(JEE%20%2F%20NEET%20%2F%20UPSC%20%2F%20GATE)" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textDecoration: 'none' }}>
              Competitive Exams (JEE / NEET)
            </Link>
          </div>

          {/* Column 4: Safety & Support */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <strong style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-primary-navy)', marginBottom: 'var(--space-1)' }}>
              Safety & Policies
            </strong>
            <Link
              to="/rules"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textDecoration: 'none' }}
            >
              <ShieldCheck size={14} color="var(--color-success)" />
              <span style={{ textDecoration: 'underline' }}>Campus Meetup Guidelines</span>
            </Link>
            <Link to="/privacy" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textDecoration: 'none' }}>
              Privacy Notice (DPDP)
            </Link>
            <Link to="/terms" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textDecoration: 'none' }}>
              Terms of Service
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--font-size-xs)', marginTop: 'var(--space-1)' }}>
              <Mail size={14} color="var(--color-primary-navy)" />
              <span style={{ color: 'var(--color-text-muted)' }}>Admin:</span>
              <a
                href="mailto:support@bookloop.in"
                style={{ color: 'var(--color-primary-navy)', fontWeight: 600, textDecoration: 'none' }}
              >
                support@bookloop.in
              </a>
            </div>
          </div>
        </div>

        {/* Bottom copyright & attribution row */}
        <div
          style={{
            borderTop: '1px solid var(--color-border-subtle)',
            paddingTop: 'var(--space-4)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 'var(--space-2)',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-muted)',
          }}
        >
          <span>&copy; {new Date().getFullYear()} BookLoop. All rights reserved. Peer-to-peer campus exchange.</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            Built with <Heart size={12} color="var(--color-error)" fill="var(--color-error)" /> for students in Pune
          </span>
        </div>
      </div>
    </footer>
  );
}
