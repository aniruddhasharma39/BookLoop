import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { LogIn, BookMarked, Eye, EyeOff, KeyRound, Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import Input from '../components/common/Input';
import Alert from '../components/common/Alert';
import { useAuth } from '../context/AuthContext';
import { checkOtpRateLimit } from '../lib/rateLimit';

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') || '/';
  const isVerifiedRedirect = searchParams.get('verified') === 'true';
  const { signIn, signInWithOtp, verifyOtp, updatePassword, isConfigured } = useAuth();
  const navigate = useNavigate();

  // Mode: 'password' | 'otp_request' | 'otp_verify' | 'set_new_password'
  const [authMode, setAuthMode] = useState('password');

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // 4-Digit OTP States
  const [digits, setDigits] = useState(['', '', '', '']);
  const digitRefs = [useRef(null), useRef(null), useRef(null), useRef(null)];
  
  // New password states (post-OTP recovery)
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Status & Feedback
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [showVerifiedSuccess, setShowVerifiedSuccess] = useState(isVerifiedRedirect);

  // Rate-limiting / Countdown timer
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  // Auto-focus first digit input when entering verify mode
  useEffect(() => {
    if (authMode === 'otp_verify') {
      setTimeout(() => {
        digitRefs[0].current?.focus();
      }, 100);
    }
  }, [authMode]);

  // Handle countdown interval
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCooldownSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  // 4-Digit input helpers
  const handleDigitChange = (index, value) => {
    const cleanVal = value.replace(/[^0-9]/g, '');
    if (!cleanVal) {
      const next = [...digits];
      next[index] = '';
      setDigits(next);
      return;
    }

    const digit = cleanVal.slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);

    // Auto-focus next input
    if (index < 3) {
      digitRefs[index + 1].current?.focus();
    }
  };

  const handleDigitKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      digitRefs[index - 1].current?.focus();
    }
  };

  const handleDigitPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, 4);
    if (!pasted) return;
    const next = ['', '', '', ''];
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i];
    }
    setDigits(next);
    const focusIdx = Math.min(pasted.length, 3);
    digitRefs[focusIdx].current?.focus();
  };

  // Standard Password Login
  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!email || !password) {
      setErrorMessage('Please fill in both email and password.');
      return;
    }

    setLoading(true);
    try {
      await signIn({ email, password });
      navigate(redirectTo);
    } catch (err) {
      console.error('Login error:', err);
      if (err.message?.includes('Invalid login credentials')) {
        setErrorMessage('Incorrect email or password. You can also sign in with OTP below.');
      } else if (err.message?.includes('Email not confirmed') || err.message?.includes('verified')) {
        setErrorMessage('Your email address has not been verified yet. Please check your inbox for the verification link.');
      } else {
        setErrorMessage(err.message || 'Unable to log in. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Step 1 of OTP: Request Code
  const handleRequestOtp = async (e) => {
    if (e) e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!email || !email.trim()) {
      setErrorMessage('Please enter your registered student email address.');
      return;
    }

    // Client-side rate-limit verification
    const rateCheck = checkOtpRateLimit(email);
    if (!rateCheck.allowed) {
      setErrorMessage(rateCheck.reason);
      if (rateCheck.waitSeconds) {
        setCooldownSeconds(rateCheck.waitSeconds);
      }
      return;
    }

    setLoading(true);
    try {
      await signInWithOtp({ email: email.trim() });
      setDigits(['', '', '', '']);
      setSuccessMessage(`We've sent a 4-digit verification code to ${email.trim()}.`);
      setAuthMode('otp_verify');
      setCooldownSeconds(60); // standard 60-second cooldown
    } catch (err) {
      console.error('OTP Request error:', err);
      setErrorMessage(err.message || 'Unable to send OTP. Please check your email and try again.');
    } finally {
      setLoading(false);
    }
  };

  // Step 2 of OTP: Verify Code
  const handleVerifyOtp = async (e) => {
    if (e) e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    const fullCode = digits.join('');
    if (fullCode.length !== 4) {
      setErrorMessage('Please enter the complete 4-digit code.');
      return;
    }

    setLoading(true);
    try {
      await verifyOtp({ email: email.trim(), token: fullCode });
      setSuccessMessage('Verification successful! You are now logged in.');
      // Give option to set a new password, or proceed
      setAuthMode('set_new_password');
    } catch (err) {
      console.error('OTP Verify error:', err);
      setErrorMessage(err.message || 'Invalid or expired 4-digit code. Please verify and try again.');
    } finally {
      setLoading(false);
    }
  };

  // Step 3 (Optional): Set New Password
  const handleSetNewPassword = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!newPassword || newPassword.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please re-enter.');
      return;
    }

    setLoading(true);
    try {
      await updatePassword(newPassword);
      setSuccessMessage('Password updated successfully! Redirecting...');
      setTimeout(() => {
        navigate(redirectTo);
      }, 1200);
    } catch (err) {
      console.error('Password update error:', err);
      setErrorMessage(err.message || 'Could not update password. You may skip this step.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '440px', margin: 'var(--space-6) auto', padding: '0 var(--space-4)' }}>
      {/* Brand Header */}
      <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
        <div style={{
          width: '52px',
          height: '52px',
          borderRadius: 'var(--radius-lg)',
          backgroundColor: 'var(--color-primary-navy)',
          color: '#fff',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 'var(--space-3)',
          boxShadow: '0 4px 12px rgba(15, 23, 42, 0.15)'
        }}>
          {authMode === 'set_new_password' ? <KeyRound size={28} /> : <BookMarked size={28} />}
        </div>

        <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--color-primary-navy)' }}>
          {authMode === 'password' && 'Welcome back'}
          {authMode === 'otp_request' && 'Sign in with OTP'}
          {authMode === 'otp_verify' && 'Enter 4-Digit Code'}
          {authMode === 'set_new_password' && 'Set New Password'}
        </h1>

        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', marginTop: '4px' }}>
          {authMode === 'password' && 'Sign in to manage your textbook listings and requests'}
          {authMode === 'otp_request' && "We'll send a 4-digit verification code to your email"}
          {authMode === 'otp_verify' && `Enter the 4-digit code sent to ${email}`}
          {authMode === 'set_new_password' && 'You can now set a new password, or skip to continue'}
        </p>
      </div>

      {/* Global Alerts */}
      {showVerifiedSuccess && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <Alert variant="success" onClose={() => setShowVerifiedSuccess(false)}>
            Email verified successfully! Please enter your password to sign in.
          </Alert>
        </div>
      )}

      {errorMessage && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <Alert variant="error" onClose={() => setErrorMessage('')}>
            {errorMessage}
          </Alert>
        </div>
      )}

      {successMessage && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <Alert variant="success" onClose={() => setSuccessMessage('')}>
            {successMessage}
          </Alert>
        </div>
      )}

      {/* Card Content based on Mode */}
      <Card>
        {/* ============================================================== */}
        {/* MODE 1: PASSWORD LOGIN                                         */}
        {/* ============================================================== */}
        {authMode === 'password' && (
          <form onSubmit={handlePasswordLogin} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <Input
              label="Student Email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@student.college.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <div>
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                suffix={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: '4px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: showPassword ? 'var(--color-primary-navy)' : '#94A3B8',
                      transition: 'color 0.15s ease',
                    }}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                }
              />

              <div style={{ textAlign: 'right', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setErrorMessage('');
                    setSuccessMessage('');
                    setAuthMode('otp_request');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--color-primary-navy)',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  Forgot password? Or sign in with OTP
                </button>
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              fullWidth
              style={{ marginTop: 'var(--space-2)' }}
            >
              <LogIn size={18} />
              <span>Sign In</span>
            </Button>
          </form>
        )}

        {/* ============================================================== */}
        {/* MODE 2: REQUEST OTP (FORGOT PASSWORD / OTP LOGIN)              */}
        {/* ============================================================== */}
        {authMode === 'otp_request' && (
          <form onSubmit={handleRequestOtp} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <Input
              label="Student Email"
              type="email"
              required
              autoFocus
              placeholder="you@student.college.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              disabled={cooldownSeconds > 0}
              fullWidth
            >
              <Mail size={18} />
              <span>
                {cooldownSeconds > 0 ? `Resend Code in ${cooldownSeconds}s` : 'Send One-Time Code'}
              </span>
            </Button>

            <button
              type="button"
              onClick={() => {
                setErrorMessage('');
                setSuccessMessage('');
                setAuthMode('password');
              }}
              style={{
                background: 'none',
                border: 'none',
                padding: 'var(--space-2)',
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-muted)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <ArrowLeft size={16} />
              <span>Back to standard password login</span>
            </button>
          </form>
        )}

        {/* ============================================================== */}
        {/* MODE 3: ENTER & VERIFY OTP CODE                                */}
        {/* ============================================================== */}
        {authMode === 'otp_verify' && (
          <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div style={{
              backgroundColor: '#EFF6FF',
              borderRadius: 'var(--radius-md)',
              padding: '12px',
              border: '1px solid #BFDBFE',
              fontSize: 'var(--font-size-xs)',
              color: '#1E40AF',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <span>Code sent to: <strong>{email}</strong></span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setErrorMessage('');
                  setAuthMode('otp_request');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  color: '#2563EB',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 'var(--font-size-xs)'
                }}
              >
                Change
              </button>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-main)', marginBottom: 'var(--space-2)', textAlign: 'center' }}>
                Enter 4-Digit Verification Code
              </label>

              <div 
                style={{ 
                  display: 'flex', 
                  justifyContent: 'center', 
                  gap: '12px',
                  margin: 'var(--space-3) 0'
                }}
                onPaste={handleDigitPaste}
              >
                {[0, 1, 2, 3].map((idx) => (
                  <input
                    key={idx}
                    ref={digitRefs[idx]}
                    type="text"
                    inputMode="numeric"
                    autoComplete={idx === 0 ? 'one-time-code' : 'off'}
                    pattern="[0-9]*"
                    maxLength={1}
                    value={digits[idx]}
                    onChange={(e) => handleDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handleDigitKeyDown(idx, e)}
                    style={{
                      width: '56px',
                      height: '62px',
                      textAlign: 'center',
                      fontSize: '28px',
                      fontWeight: 700,
                      color: 'var(--color-primary-navy)',
                      backgroundColor: 'var(--color-surface)',
                      border: digits[idx] ? '2px solid var(--color-primary-navy)' : '1.5px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      outline: 'none',
                      boxShadow: digits[idx] ? '0 0 0 3px rgba(30, 58, 138, 0.12)' : 'none',
                      transition: 'all 0.15s ease'
                    }}
                  />
                ))}
              </div>

              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', display: 'block', textAlign: 'center' }}>
                Type the 4-digit code shown in your email from BookLoop.
              </span>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              fullWidth
            >
              <LogIn size={18} />
              <span>Verify & Sign In</span>
            </Button>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-2)' }}>
              <button
                type="button"
                disabled={cooldownSeconds > 0 || loading}
                onClick={handleRequestOtp}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  fontSize: 'var(--font-size-xs)',
                  color: cooldownSeconds > 0 ? 'var(--color-text-muted)' : 'var(--color-primary-navy)',
                  fontWeight: 600,
                  cursor: cooldownSeconds > 0 ? 'not-allowed' : 'pointer',
                  textDecoration: cooldownSeconds > 0 ? 'none' : 'underline',
                }}
              >
                {cooldownSeconds > 0 ? `Resend OTP in ${cooldownSeconds}s` : 'Resend One-Time Code'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setErrorMessage('');
                  setSuccessMessage('');
                  setAuthMode('password');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-text-muted)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* ============================================================== */}
        {/* MODE 4: POST-LOGIN SET NEW PASSWORD (OPTIONAL / RECOVERY)      */}
        {/* ============================================================== */}
        {authMode === 'set_new_password' && (
          <form onSubmit={handleSetNewPassword} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px',
              backgroundColor: '#F0FDF4',
              borderRadius: 'var(--radius-md)',
              border: '1px solid #BBF7D0',
              fontSize: 'var(--font-size-xs)',
              color: '#166534'
            }}>
              <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
              <span>
                <strong>Authenticated!</strong> You may set a new password for future logins, or skip to continue right away.
              </span>
            </div>

            <Input
              label="New Password"
              type={showNewPassword ? 'text' : 'password'}
              required
              placeholder="At least 6 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              suffix={
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '4px',
                    cursor: 'pointer',
                    color: showNewPassword ? 'var(--color-primary-navy)' : '#94A3B8',
                  }}
                  aria-label="Toggle password visibility"
                >
                  {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              }
            />

            <Input
              label="Confirm New Password"
              type={showNewPassword ? 'text' : 'password'}
              required
              placeholder="Re-type new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              fullWidth
            >
              <KeyRound size={18} />
              <span>Save Password & Continue</span>
            </Button>

            <Button
              type="button"
              variant="secondary"
              size="md"
              fullWidth
              onClick={() => navigate(redirectTo)}
            >
              <span>Skip for Now & Go to Marketplace</span>
            </Button>
          </form>
        )}

        {/* Footer Link */}
        <div style={{ textAlign: 'center', marginTop: 'var(--space-5)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
          New to BookLoop?{' '}
          <Link to="/signup" style={{ fontWeight: 600 }}>
            Create an account
          </Link>
        </div>
      </Card>
    </div>
  );
}
