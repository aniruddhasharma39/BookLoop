import React from 'react';
import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';
import Button from '../components/common/Button';
import Card from '../components/common/Card';

export default function NotFoundPage() {
  return (
    <div style={{ maxWidth: '480px', margin: 'var(--space-12) auto', textAlign: 'center' }}>
      <Card style={{ padding: 'var(--space-8)' }}>
        <h1 style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--color-primary-navy)', marginBottom: 'var(--space-2)' }}>
          404
        </h1>
        <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
          Page not found
        </h2>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-5)' }}>
          The page you are looking for doesn't exist or may have been moved.
        </p>
        <Link to="/">
          <Button variant="primary">
            <Home size={18} />
            <span>Return to Home</span>
          </Button>
        </Link>
      </Card>
    </div>
  );
}

