import React from 'react';
import './Card.css';

export default function Card({
  children,
  className = '',
  onClick,
  hoverable = false,
  as: Component = 'div',
  ...props
}) {
  return (
    <Component
      className={`card ${hoverable ? 'card--hoverable' : ''} ${className}`}
      onClick={onClick}
      {...props}
    >
      {children}
    </Component>
  );
}

