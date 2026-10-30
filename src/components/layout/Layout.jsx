import React from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import BottomNav from './BottomNav';
import Footer from './Footer';
import Alert from '../common/Alert';
import { useAuth } from '../../context/AuthContext';

export default function Layout() {
  const { isConfigured } = useAuth();

  return (
    <div className="app-shell" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Navbar />

      <main className="main-content" style={{ flex: '1 0 auto' }}>
        {!isConfigured && (
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <Alert
              variant="warning"
              title="Supabase Environment Not Configured"
            >
              Please copy <code>.env.example</code> to <code>.env.local</code> and provide your real
              Supabase project URL and anon key to test live database and authentication features.
            </Alert>
          </div>
        )}
        <Outlet />
      </main>

      <Footer />
      <BottomNav />
    </div>
  );
}

