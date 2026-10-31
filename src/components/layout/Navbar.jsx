import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import { BookMarked, Search, PlusCircle, MessageSquare, User, Shield } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Button from '../common/Button';
import './Navigation.css';

export default function Navbar() {
  const { user, profile, isAdmin, isConfigured, hasUnseenRequests } = useAuth();

  return (
    <header className="navbar">
      <div className="navbar__container">
        {/* Brand Logo - Far Left */}
        <Link to="/" className="navbar__brand">
          <div className="navbar__logo-icon" aria-hidden="true">
            <BookMarked size={22} />
          </div>
          <div className="navbar__brand-text">
            <span className="navbar__title">BookLoop</span>
            <span className="navbar__tagline">Find a book. Pass it on.</span>
          </div>
        </Link>

        {/* Right Section - All items arranged horizontally together on far right */}
        <div className="navbar__right-section">
          {/* Desktop Navigation Links */}
          <nav className="navbar__desktop-nav" aria-label="Desktop primary navigation">
            <NavLink to="/" end className={({ isActive }) => `navbar__link ${isActive ? 'is-active' : ''}`}>
              Home
            </NavLink>
            <NavLink to="/search" className={({ isActive }) => `navbar__link ${isActive ? 'is-active' : ''}`}>
              <Search size={16} aria-hidden="true" />
              <span>Search</span>
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

          {/* Action CTA & Profile Avatar */}
          <div className="navbar__actions">
            {user ? (
              <>
                <Link to="/listings/new" className="navbar__cta-btn">
                  <PlusCircle size={18} />
                  <span>Sell a Book</span>
                </Link>

                <Link
                  to="/profile"
                  className="navbar__avatar-btn"
                  title={`Signed in as ${profile?.display_name || user.email?.split('@')[0] || 'Student'}. View Profile`}
                  aria-label="View Student Profile"
                >
                  {profile?.display_name ? (
                    <span className="navbar__avatar-letter">
                      {profile.display_name.charAt(0).toUpperCase()}
                    </span>
                  ) : (
                    <User size={18} />
                  )}
                </Link>
              </>
            ) : (
              <div className="navbar__auth-buttons">
                <Link to="/login" className="navbar__link navbar__login-link">
                  Log In
                </Link>
                <Link to="/signup" className="navbar__cta-btn">
                  <span>Join BookLoop</span>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

