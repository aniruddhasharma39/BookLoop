import React from 'react';
import { Link } from 'react-router-dom';
import { FileText, ShieldAlert, CheckCircle, ArrowLeft, AlertTriangle } from 'lucide-react';
import Card from '../components/common/Card';
import Alert from '../components/common/Alert';

export default function TermsPage() {
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
          <ArrowLeft size={16} />
          <span>Back to Home</span>
        </Link>
      </div>

      <div>
        <h1 style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 800, color: 'var(--color-primary-navy)', margin: 0 }}>
          Terms of Service
        </h1>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', marginTop: '4px' }}>
          Last updated: October 2026 &bull; Student Marketplace Guidelines
        </p>
      </div>

      <Alert variant="warning" title="Draft Agreement — Pending Review by Product Owner">
        These terms govern participation in the BookLoop campus marketplace. Review and adapt these clauses with your university or institutional legal advisors prior to commercial deployment.
      </Alert>

      <Card style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', lineHeight: 1.6 }}>
        <div>
          <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--color-primary-navy)' }}>
            1. Peer-to-Peer Directory Only
          </h2>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)', marginTop: 'var(--space-1)' }}>
            BookLoop is a student directory that connects peer buyers and sellers at educational institutions. BookLoop is <strong>not</strong> an online retailer, consignment agent, or escrow provider. Users inspect textbooks and exchange funds directly during in-person campus handovers.
          </p>
        </div>

        <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: 'var(--space-4)' }}>
          <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--color-primary-navy)' }}>
            2. Prohibited Content & Textbooks (Zero Tolerance)
          </h2>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)', marginTop: 'var(--space-1)' }}>
            Sellers must only list authentic second-hand textbooks they legally own. The following are strictly banned:
          </p>
          <ul style={{ paddingLeft: 'var(--space-5)', marginTop: 'var(--space-2)', fontSize: 'var(--font-size-sm)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <li><strong>Counterfeits & Pirated Reprints:</strong> Unauthorized photocopies, spiral-bound Xerox copies, and pirated reprints infringe Indian Copyright Law and are permanently prohibited.</li>
            <li><strong>Teacher & Examination Material:</strong> Stolen faculty solution manuals, leaked question banks, or confidential university answer keys.</li>
            <li><strong>Non-Book Items:</strong> Electronics, clothing, non-educational merchandise, or prohibited substances.</li>
            <li><strong>Defamatory or Abusive Content:</strong> Inappropriate descriptions, harassing messages, or offensive titles.</li>
          </ul>
        </div>

        <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: 'var(--space-4)' }}>
          <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--color-primary-navy)' }}>
            3. Seller Commitments
          </h2>
          <ul style={{ paddingLeft: 'var(--space-5)', marginTop: 'var(--space-2)', fontSize: 'var(--font-size-sm)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <li>Provide honest photos displaying real condition (highlighting markings, missing pages, or binding damage).</li>
            <li>State fair, non-inflated student prices.</li>
            <li>Respond respectfully to accepted requests and promptly mark books as sold when handovers finish.</li>
          </ul>
        </div>

        <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: 'var(--space-4)' }}>
          <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--color-primary-navy)' }}>
            4. Buyer Commitments
          </h2>
          <ul style={{ paddingLeft: 'var(--space-5)', marginTop: 'var(--space-2)', fontSize: 'var(--font-size-sm)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <li>Submit interest requests only when genuinely intending to acquire the book.</li>
            <li>Respect the seller's time and arrive promptly for the agreed daytime campus meetup.</li>
            <li>Inspect the textbook before completing the transaction.</li>
          </ul>
        </div>

        <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: 'var(--space-4)' }}>
          <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--color-primary-navy)' }}>
            5. Moderation & Account Suspension
          </h2>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)', marginTop: 'var(--space-1)' }}>
            BookLoop community moderators reserve the right to remove listings, dismiss requests, or suspend student accounts that violate these terms, with or without prior notice. Suspended users lose the ability to publish or request books.
          </p>
        </div>

        <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: 'var(--space-4)' }}>
          <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--color-primary-navy)' }}>
            6. Questions & Legal Inquiries
          </h2>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)', marginTop: 'var(--space-1)' }}>
            To report an infringement or dispute a moderation action, contact our administrative team at{' '}
            <a href="mailto:support.urbancloud@gmail.com" style={{ fontWeight: 600 }}>support.urbancloud@gmail.com</a>.
          </p>
        </div>
      </Card>
    </div>
  );
}

