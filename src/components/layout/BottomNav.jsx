import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Search, PlusCircle, MessageSquare, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import './Navigation.css';

export default function BottomNav() {
  const { user, hasUnseenRequests } = useAuth();
  return (
    <nav className="bottom-nav" aria-label="Mobile navigation">
      <NavLink
        to="/"
        end
        className={({ isActive }) => `bottom-nav__item ${isActive ? 'is-active' : ''}`}
      >
        <Home size={20} aria-hidden="true" />
        <span className="bottom-nav__label">Home</span>
      </NavLink>

      <NavLink
        to="/search"
        className={({ isActive }) => `bottom-nav__item ${isActive ? 'is-active' : ''}`}
      >
        <Search size={20} aria-hidden="true" />
        <span className="bottom-nav__label">Search</span>
      </NavLink>

      <NavLink
        to="/listings/new"
        className={({ isActive }) => `bottom-nav__item bottom-nav__item--sell ${isActive ? 'is-active' : ''}`}
      >
        <div className="bottom-nav__sell-badge" aria-hidden="true">
          <PlusCircle size={22} />
        </div>
        <span className="bottom-nav__label">Sell</span>
      </NavLink>

      {user && (
        <NavLink
          to="/requests"
          className={({ isActive }) => `bottom-nav__item ${isActive ? 'is-active' : ''}`}
        >
          <div style={{ position: 'relative', display: 'inline-flex' }}>
            <MessageSquare size={20} aria-hidden="true" />
            {hasUnseenRequests && (
              <span
                style={{
                  position: 'absolute',
                  top: '-2px',
                  right: '-4px',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: '#F97316',
                  boxShadow: '0 0 0 2px #fff',
                }}
              />
            )}
          </div>
          <span className="bottom-nav__label">Requests</span>
        </NavLink>
      )}

      <NavLink
        to="/profile"
        className={({ isActive }) => `bottom-nav__item ${isActive ? 'is-active' : ''}`}
      >
        <User size={20} aria-hidden="true" />
        <span className="bottom-nav__label">Profile</span>
      </NavLink>
    </nav>
  );
}

