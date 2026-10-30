import React, { useState } from 'react';
import { Flag, AlertTriangle, CheckCircle2 } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import Select from './Select';
import Alert from './Alert';
import { useAuth } from '../../context/AuthContext';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';

const REPORT_REASONS = [
  { value: 'Counterfeit / Pirated Material', label: 'Counterfeit, Pirated, or Illegal Photocopy' },
  { value: 'Scam or Suspicious Behavior', label: 'Scam, Fraud, or Suspicious Behavior' },
  { value: 'Inappropriate or Abusive Content', label: 'Inappropriate, Offensive, or Abusive Content' },
  { value: 'Misleading / Incorrect Information', label: 'Misleading Details, False Edition, or Wrong Price' },
  { value: 'Prohibited Item', label: 'Prohibited Item (Not an educational book/material)' },
  { value: 'Other Community Violation', label: 'Other Community Guidelines Violation' },
];

export default function ReportModal({
  isOpen,
  onClose,
  targetType = 'listing', // 'listing' | 'user'
  targetId,
  targetTitle,
  reportedUserId,
}) {
  const { user } = useAuth();
  const [reason, setReason] = useState(REPORT_REASONS[0].value);
  const [details, setDetails] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) {
      setErrorMsg('You must be signed in to submit a safety report.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      if (!isSupabaseConfigured) {
        setSuccess(true);
        setTimeout(() => {
          onClose();
          setSuccess(false);
        }, 1500);
        return;
      }

      const { error } = await supabase.from('reports').insert({
        reporter_id: user.id,
        listing_id: targetType === 'listing' ? targetId : null,
        reported_user_id: reportedUserId || (targetType === 'user' ? targetId : null),
        reason,
        details: details.trim() || null,
        status: 'open',
      });

      if (error) throw error;

      setSuccess(true);
      setTimeout(() => {
        onClose();
        setSuccess(false);
        setDetails('');
      }, 1500);
    } catch (err) {
      console.error('Failed to submit report:', err);
      setErrorMsg(err.message || 'Failed to submit report. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Report ${targetType === 'listing' ? 'Listing' : 'User'}`}
      footer={
        !success && (
          <>
            <Button variant="outline" size="md" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              loading={loading}
              onClick={handleSubmit}
              style={{ backgroundColor: 'var(--color-error)', borderColor: 'var(--color-error)' }}
            >
              <Flag size={15} />
              <span>Submit Report</span>
            </Button>
          </>
        )
      }
    >
      {success ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-4) 0' }}>
          <CheckCircle2 size={44} color="var(--color-success)" style={{ margin: '0 auto var(--space-2)' }} />
          <h4 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--color-primary-navy)' }}>
            Report Submitted
          </h4>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', marginTop: 'var(--space-1)' }}>
            Thank you for helping keep our campus community safe. A moderator will review your report shortly.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {errorMsg && <Alert variant="error">{errorMsg}</Alert>}

          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: 0 }}>
            Reporting: <strong>{targetTitle || (targetType === 'listing' ? 'This listing' : 'This student')}</strong>
          </p>

          <Select
            label="Reason for reporting *"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            options={REPORT_REASONS}
          />

          <div>
            <label
              style={{
                display: 'block',
                fontSize: 'var(--font-size-xs)',
                fontWeight: 600,
                color: 'var(--color-text-main)',
                marginBottom: 'var(--space-1)',
              }}
            >
              Additional Details (Optional)
            </label>
            <textarea
              rows={3}
              placeholder="Describe the issue to help our campus moderation team investigate..."
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              style={{
                width: '100%',
                padding: 'var(--space-2) var(--space-3)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                fontSize: 'var(--font-size-sm)',
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />
          </div>

          <div
            style={{
              padding: 'var(--space-2) var(--space-3)',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--color-secondary-soft-blue)',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-primary-navy)',
              lineHeight: 1.4,
            }}
          >
            <strong>Campus Honor Code:</strong> Reports are confidential. Sellers or users are not told who reported them. False or malicious reports violate community guidelines.
          </div>
        </form>
      )}
    </Modal>
  );
}

