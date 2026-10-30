import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Sun, MapPin, Users, AlertTriangle, ArrowLeft, Ban, CheckCircle } from 'lucide-react';
import Card from '../components/common/Card';
import Alert from '../components/common/Alert';

export default function SafetyRulesPage() {
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
          Community Rules & Meetup Safety Guidance
        </h1>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', marginTop: '4px' }}>
          Guidelines for safe, peer-to-peer textbook handovers across Pune schools and colleges.
        </p>
      </div>

      <Alert variant="warning" title="Draft Community Guidance — Pending Review by Product Owner & Campus Staff">
        These safety rules are designed to protect students during physical book handovers. Review and approve before full launch.
      </Alert>

      {/* Meetup Safety Guidance */}
      <Card style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#EAF2FF', color: 'var(--color-primary-navy)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShieldCheck size={22} />
          </div>
          <div>
            <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--color-primary-navy)', margin: 0 }}>
              The 5 Golden Rules of Campus Meetups
            </h2>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Follow these guidelines for every book exchange</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-3)' }}>
          <div style={{ padding: 'var(--space-3)', backgroundColor: '#F8FAFC', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-primary-navy)', fontWeight: 700, fontSize: 'var(--font-size-sm)' }}>
              <MapPin size={18} color="var(--color-primary-navy)" />
              <span>1. Public Staffed Campus Only</span>
            </div>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: '6px', lineHeight: 1.5 }}>
              Always meet at a busy, staffed campus location: the central library lobby, department entrance, student canteen, or main security gate. Never agree to meet in private rooms, secluded campus corners, or off-campus alleyways.
            </p>
          </div>

          <div style={{ padding: 'var(--space-3)', backgroundColor: '#F8FAFC', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-primary-navy)', fontWeight: 700, fontSize: 'var(--font-size-sm)' }}>
              <Sun size={18} color="var(--color-accent-yellow-hover)" />
              <span>2. Daytime Hours Only</span>
            </div>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: '6px', lineHeight: 1.5 }}>
              Conduct handovers between 9:00 AM and 5:00 PM during daylight hours when staff, faculty, and fellow students are present.
            </p>
          </div>

          <div style={{ padding: 'var(--space-3)', backgroundColor: '#F8FAFC', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-primary-navy)', fontWeight: 700, fontSize: 'var(--font-size-sm)' }}>
              <Users size={18} color="var(--color-primary-navy)" />
              <span>3. Bring a Buddy or Parent</span>
            </div>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: '6px', lineHeight: 1.5 }}>
              For junior college and school students, we strongly encourage bringing a parent, guardian, or trusted campus classmate along to the meetup point.
            </p>
          </div>

          <div style={{ padding: 'var(--space-3)', backgroundColor: '#F8FAFC', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-danger)', fontWeight: 700, fontSize: 'var(--font-size-sm)' }}>
              <Ban size={18} color="var(--color-danger)" />
              <span>4. Never Share Live GPS</span>
            </div>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: '6px', lineHeight: 1.5 }}>
              Never send live location pins, residential street addresses, or hostel room numbers. Coordinate by naming a specific landmark on campus (e.g. "Front steps of COEP Main Building").
            </p>
          </div>
        </div>

        <div style={{ padding: 'var(--space-3)', backgroundColor: '#F0FDF4', borderRadius: 'var(--radius-md)', border: '1px solid #BBF7D0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-success)', fontWeight: 700, fontSize: 'var(--font-size-sm)' }}>
            <CheckCircle size={18} />
            <span>5. Inspect Before Payment</span>
          </div>
          <p style={{ fontSize: 'var(--font-size-xs)', color: '#166534', marginTop: '4px', lineHeight: 1.5 }}>
            Open the book together. Check edition numbers, page count, syllabus relevance, and condition. Only hand over the agreed cash amount once you are completely satisfied. Never send advance online payments or deposits.
          </p>
        </div>
      </Card>

      {/* Community Rules & Prohibited Content */}
      <Card style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--color-primary-navy)' }}>
          Community Rules & Content Policy
        </h2>
        <ul style={{ paddingLeft: 'var(--space-5)', fontSize: 'var(--font-size-sm)', display: 'flex', flexDirection: 'column', gap: '8px', color: 'var(--color-text-main)', lineHeight: 1.6 }}>
          <li>
            <strong>No Pirated / Photocopied Textbooks:</strong> Selling spiral-bound Xerox copies, photocopied volumes, or unauthorized PDF prints violates copyright and will result in an immediate permanent ban.
          </li>
          <li>
            <strong>Accurate Representation:</strong> List books under their true condition (New / Like New, Good, Acceptable). Disclose highlighted lines or torn covers openly.
          </li>
          <li>
            <strong>Fair Student Pricing:</strong> Second-hand books should keep education affordable for peers. Price gouging is discouraged.
          </li>
          <li>
            <strong>Honor Commitments:</strong> Once you accept a request or agree to a meetup time, show up on time or notify your peer promptly.
          </li>
          <li>
            <strong>Zero Tolerance for Harassment:</strong> Respect your peers. Abusive language or inappropriate requests will be reported directly to campus administrators.
          </li>
        </ul>

        <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: 0 }}>
            See a violation or need support? Use the <strong>"Report listing"</strong> button on any book or contact the administrator at <a href="mailto:support@bookloop.in" style={{ fontWeight: 600 }}>support@bookloop.in</a>.
          </p>
        </div>
      </Card>
    </div>
  );
}
