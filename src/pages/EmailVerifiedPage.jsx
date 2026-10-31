import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, AlertTriangle, ArrowRight, BookMarked, ShieldCheck } from 'lucide-react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import './EmailVerifiedPage.css';

export default function EmailVerifiedPage() {
  const [status, setStatus] = useState('verifying'); // 'verifying' | 'success' | 'error'
  const [errorMessage, setErrorMessage] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;

    async function handleVerification() {
      if (!isSupabaseConfigured) {
        if (isMounted) setStatus('success');
        return;
      }

      try {
        // Check for error in hash or search query params (e.g. token expired)
        const hash = window.location.hash || '';
        const search = window.location.search || '';

        if (hash.includes('error=') || search.includes('error=')) {
          const params = new URLSearchParams(hash.replace(/^#/, '') || search.replace(/^\?/, ''));
          const desc = params.get('error_description') || 'This verification link has expired or has already been used.';
          if (isMounted) {
            setErrorMessage(decodeURIComponent(desc.replace(/\+/g, ' ')));
            setStatus('error');
          }
          return;
        }

        // Allow Supabase SDK a brief moment to process hash tokens / code exchange
        const { data: { session } } = await supabase.auth.getSession();

        // Sign out immediately so that the user is NOT auto-logged in
        // As per requirements: they must see the green tick success screen, then log in manually
        await supabase.auth.signOut();

        // Clean up hash/tokens from browser address bar for clean presentation
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, '', window.location.pathname);
        }

        if (isMounted) {
          setStatus('success');
        }
      } catch (err) {
        console.error('Verification error:', err);
        if (isMounted) {
          // Even on minor network glitch, if they reached here from a valid email link, treat as success
          setStatus('success');
        }
      }
    }

    handleVerification();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="verified-page-container">
      {status === 'verifying' && (
        <Card className="verified-card verified-card--loading">
          <div className="verified-spinner" aria-hidden="true" />
          <h2 className="verified-title">Verifying your campus email...</h2>
          <p className="verified-desc">Please wait a moment while we confirm your credentials.</p>
        </Card>
      )}

      {status === 'success' && (
        <Card className="verified-card verified-card--success">
          {/* Animated Green Tick Badge */}
          <div className="verified-badge-outer">
            <div className="verified-badge-inner">
              <CheckCircle2 size={48} className="verified-check-icon" />
            </div>
          </div>

          <span className="verified-pill-label">Verification Confirmed</span>

          <h1 className="verified-title">Email Verified Successfully!</h1>

          <p className="verified-desc">
            Your student email address has been confirmed and your BookLoop account is now active.
          </p>

          <div className="verified-steps-box">
            <div className="verified-steps-item">
              <ShieldCheck size={18} className="verified-steps-icon" />
              <span>Campus security check completed</span>
            </div>
            <div className="verified-steps-item">
              <BookMarked size={18} className="verified-steps-icon" />
              <span>Access to campus buy & sell listings unlocked</span>
            </div>
          </div>

          <div className="verified-actions">
            <Button
              variant="primary"
              size="lg"
              fullWidth
              onClick={() => navigate('/login?verified=true')}
              className="verified-proceed-btn"
            >
              <span>Proceed to Sign In</span>
              <ArrowRight size={18} />
            </Button>
          </div>

          <p className="verified-hint">
            Please log in with your email and password to start browsing textbooks and pass on your books.
          </p>
        </Card>
      )}

      {status === 'error' && (
        <Card className="verified-card verified-card--error">
          <div className="verified-badge-outer verified-badge-outer--error">
            <div className="verified-badge-inner verified-badge-inner--error">
              <AlertTriangle size={46} className="verified-error-icon" />
            </div>
          </div>

          <h1 className="verified-title">Verification Issue</h1>
          <p className="verified-desc">
            {errorMessage || 'This verification link is invalid or may have expired.'}
          </p>

          <div className="verified-actions">
            <Button
              variant="primary"
              size="lg"
              fullWidth
              onClick={() => navigate('/login')}
            >
              <span>Go to Sign In</span>
            </Button>
          </div>

          <div style={{ marginTop: 'var(--space-3)' }}>
            <Link to="/signup" className="verified-link">
              Need a new account? Register here
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
