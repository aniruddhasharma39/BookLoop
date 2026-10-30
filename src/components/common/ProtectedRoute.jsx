import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import LoadingState from './LoadingState';

export default function ProtectedRoute({ children, requireAdmin = false }) {
  const { user, profile, isAdmin, loading, isConfigured } = useAuth();
  const location = useLocation();

  if (loading) {
    return <LoadingState message="Checking authorization..." />;
  }

  // If Supabase isn't configured yet, allow viewing placeholders with a notice
  if (!isConfigured) {
    return children;
  }

  // Not logged in -> redirect to login preserving intended target
  if (!user) {
    return <Navigate to={`/login?redirectTo=${encodeURIComponent(location.pathname)}`} replace />;
  }

  // Check account suspension
  if (profile && profile.account_status === 'suspended') {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Account Suspended</h2>
        <p>Your BookLoop account is currently suspended. Please contact support.</p>
      </div>
    );
  }

  // Admin-only route guard
  if (requireAdmin && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
}

