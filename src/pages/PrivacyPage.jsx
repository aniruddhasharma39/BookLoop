import React from 'react';
import { Link } from 'react-router-dom';
import { Shield, Lock, Eye, AlertCircle, ArrowLeft, HeartHandshake } from 'lucide-react';
import Card from '../components/common/Card';
import Alert from '../components/common/Alert';
import Button from '../components/common/Button';

export default function PrivacyPage() {
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
          Privacy Notice
        </h1>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', marginTop: '4px' }}>
          Last updated: October 2026 &bull; BookLoop Campus Peer-to-Peer Marketplace
        </p>
      </div>

      <Alert variant="warning" title="Draft Policy — Pending Product Owner & Legal Review">
        This document is an MVP draft outlining BookLoop's privacy architecture. Before public launch with real student data, review with legal counsel regarding India's Digital Personal Data Protection (DPDP) Act 2023, guardian consent requirements for minors, and university privacy bylaws.
      </Alert>

      <Card style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', lineHeight: 1.6 }}>
        <div>
          <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--color-primary-navy)' }}>
            1. Our Student Privacy Principles
          </h2>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)', marginTop: 'var(--space-1)' }}>
            BookLoop was built to protect campus school and college students. Unlike general classifieds, we minimize personal data collection and enforce strict database-level privacy boundaries:
          </p>
          <ul style={{ paddingLeft: 'var(--space-5)', marginTop: 'var(--space-2)', fontSize: 'var(--font-size-sm)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <li><strong>No Public Phone or Email:</strong> Your phone number and email address are never exposed on search pages, book listings, or public profiles.</li>
            <li><strong>Controlled Handover Reveal:</strong> A seller's WhatsApp number is encrypted in the database and only revealed to a single buyer after the seller explicitly accepts their interest request.</li>
            <li><strong>No Sensitive Geolocation:</strong> We never track, record, or share live GPS coordinates or home addresses. Location is limited to registered educational institutions (e.g. Acropolis, SGSITS, IET DAVV).</li>
            <li><strong>No Payment Card Storage:</strong> BookLoop does not process payments or store bank account/card numbers. Handover transactions are handled peer-to-peer upon physical book inspection.</li>
          </ul>
        </div>

        <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: 'var(--space-4)' }}>
          <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--color-primary-navy)' }}>
            2. Data We Collect & Why
          </h2>
          <div style={{ overflowX: 'auto', marginTop: 'var(--space-2)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' }}>
              <thead>
                <tr style={{ backgroundColor: '#F8FAFC', textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ padding: '8px 12px' }}>Data Field</th>
                  <th style={{ padding: '8px 12px' }}>Visibility</th>
                  <th style={{ padding: '8px 12px' }}>Purpose</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>Display Name</td>
                  <td style={{ padding: '8px 12px' }}>Public to campus peers</td>
                  <td style={{ padding: '8px 12px' }}>Identification on listings and meetup requests.</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>School / College</td>
                  <td style={{ padding: '8px 12px' }}>Public to campus peers</td>
                  <td style={{ padding: '8px 12px' }}>Filtering textbooks by campus and meetup convenience.</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>Email Address</td>
                  <td style={{ padding: '8px 12px' }}>Private (Admin only)</td>
                  <td style={{ padding: '8px 12px' }}>Account authentication, password resets, and safety notices.</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>WhatsApp Number</td>
                  <td style={{ padding: '8px 12px' }}>Revealed ONLY on request accept</td>
                  <td style={{ padding: '8px 12px' }}>Direct coordination of safe campus daytime book handover.</td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>Course & Year (Optional)</td>
                  <td style={{ padding: '8px 12px' }}>Public on profile</td>
                  <td style={{ padding: '8px 12px' }}>Helping juniors connect with seniors for syllabus books.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: 'var(--space-4)' }}>
          <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--color-primary-navy)' }}>
            3. Minor Users & Guardian Consent (DPDP Act)
          </h2>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)', marginTop: 'var(--space-1)' }}>
            BookLoop serves school students (grades 9–12) as well as college students. Under India's Digital Personal Data Protection Act (DPDP Act 2023):
          </p>
          <ul style={{ paddingLeft: 'var(--space-5)', marginTop: 'var(--space-2)', fontSize: 'var(--font-size-sm)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <li>Students under 18 years of age must register and use the service with the verifiable knowledge and consent of a parent or legal guardian.</li>
            <li>Parents and guardians are encouraged to accompany minors during book exchanges or supervise the public school meetup.</li>
            <li>Parents may contact <a href="mailto:support@bookloop.in" style={{ fontWeight: 600 }}>support@bookloop.in</a> at any time to inspect, modify, or request deletion of a minor's profile data.</li>
          </ul>
        </div>

        <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: 'var(--space-4)' }}>
          <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--color-primary-navy)' }}>
            4. Account Deletion & Data Retention
          </h2>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)', marginTop: 'var(--space-1)' }}>
            You can request full account deletion at any time directly from your <Link to="/profile" style={{ fontWeight: 600 }}>Profile page</Link>. When submitted:
          </p>
          <ul style={{ paddingLeft: 'var(--space-5)', marginTop: 'var(--space-2)', fontSize: 'var(--font-size-sm)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <li>All your active book listings are immediately removed from search and public view.</li>
            <li>Pending interest requests are closed.</li>
            <li>Personal data is purged within 48 hours, retaining only immutable audit logs required for campus safety investigations.</li>
          </ul>
        </div>

        <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: 'var(--space-4)' }}>
          <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--color-primary-navy)' }}>
            5. Contacting the Administrator
          </h2>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)', marginTop: 'var(--space-1)' }}>
            For privacy inquiries, moderation appeals, or data deletion requests, email our administration team at:
          </p>
          <p style={{ marginTop: 'var(--space-2)' }}>
            <a
              href="mailto:support@bookloop.in"
              style={{ fontWeight: 700, fontSize: 'var(--font-size-base)', color: 'var(--color-primary-navy)' }}
            >
              support@bookloop.in
            </a>
          </p>
        </div>
      </Card>
    </div>
  );
}

