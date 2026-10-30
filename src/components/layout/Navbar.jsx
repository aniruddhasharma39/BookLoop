import React from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { BookMarked, Search, PlusCircle, MessageSquare, User, Shield, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Button from '../common/Button';
import './Navigation.css';

export default function Navbar() {
  const { user, profile, isAdmin, signOut, isConfigured, hasUnseenRequests } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/');
    } catch (err) {
      console.error('Failed to log out:', err);
    }
  };

  return (
    <header className="navbar">
      <div className="navbar__container">
        {/* Brand Logo */}
        <Link to="/" className="navbar__brand">
          <div className="navbar__logo-icon" aria-hidden="true">
            <BookMarked size={20} />
          </div>
          <div className="navbar__brand-text">
            <span className="navbar__title">BookLoop</span>
            <span className="navbar__tagline">Find a book. Pass it on.</span>
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="navbar__desktop-nav" aria-label="Desktop primary navigation">
          <NavLink to="/" end className={({ isActive }) => `navbar__link ${isActive ? 'is-active' : ''}`}>
            Home
          </NavLink>
          <NavLink to="/search" className={({ isActive }) => `navbar__link ${isActive ? 'is-active' : ''}`}>
            <Search size={16} aria-hidden="true" />
            <span>Search</span>
          </NavLink>
          <NavLink to="/listings/new" className={({ isActive }) => `navbar__link ${isActive ? 'is-active' : ''}`}>
            <PlusCircle size={16} aria-hidden="true" />
            <span>Sell a Book</span>
          </NavLink>

          {user && (
            <NavLink to="/requests" className={({ isActive }) => `navbar__link ${isActive ? 'is-active' : ''}`}>
              <MessageSquare size={16} aria-hidden="true" />
              <span>Requests</span>
              {hasUnseenRequests && (
                <span
                  className="nav-notification-dot"
                  title="New requests update"
                />
              )}
            </NavLink>
          )}

          {isAdmin && (
            <NavLink to="/admin" className={({ isActive }) => `navbar__link ${isActive ? 'is-active' : ''}`}>
              <Shield size={16} aria-hidden="true" />
              <span>Admin</span>
            </NavLink>
          )}
        </nav>

        {/* Desktop User / Auth Actions */}
        <div className="navbar__actions">
          {user ? (
            <div className="navbar__user-menu">
              <Link to="/profile" className="navbar__profile-link" title="View Profile">
                <div className="navbar__avatar" aria-hidden="true">
                  <User size={16} />
                </div>
                <span className="navbar__user-name">
                  {profile?.display_name || user.email?.split('@')[0]}
                </span>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                aria-label="Sign out of BookLoop"
                className="navbar__logout-btn"
              >
                <LogOut size={16} />
              </Button>
            </div>
          ) : (
            <div className="navbar__auth-buttons">
              <Link to="/login">
                <Button variant="ghost" size="sm">
                  Log In
                </Button>
              </Link>
              <Link to="/signup">
                <Button variant="primary" size="sm">
                  Join BookLoop
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

