import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { LogIn, BookMarked } from 'lucide-react';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import Input from '../components/common/Input';
import Alert from '../components/common/Alert';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') || '/';
  const { signIn, isConfigured } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMessage('');

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
      // Give clean, friendly error messages
      if (err.message?.includes('Invalid login credentials')) {
        setErrorMessage('Incorrect email or password. Please verify and try again.');
      } else if (err.message?.includes('Email not confirmed')) {
        setErrorMessage('Your email address has not been verified yet. Please check your inbox for the verification link.');
      } else {
        setErrorMessage(err.message || 'Unable to log in. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '420px', margin: 'var(--space-6) auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--color-primary-navy)',
          color: '#fff',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 'var(--space-2)'
        }}>
          <BookMarked size={26} />
        </div>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--color-primary-navy)' }}>
          Welcome back
        </h1>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
          Sign in to manage your textbook listings and requests
        </p>
      </div>

      {errorMessage && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <Alert variant="error" onClose={() => setErrorMessage('')}>
            {errorMessage}
          </Alert>
        </div>
      )}

      <Card>
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Input
            label="Student Email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@student.college.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <Input
            label="Password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

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

