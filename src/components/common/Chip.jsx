import React from 'react';
import './Chip.css';

export default function Chip({
  label,
  children,
  selected = false,
  onClick,
  variant = 'default', // 'default' | 'accent' | 'success' | 'warning'
  className = '',
  ...props
}) {
  const isClickable = Boolean(onClick);
  const Component = isClickable ? 'button' : 'span';

  return (
    <Component
      type={isClickable ? 'button' : undefined}
      onClick={onClick}
      className={`chip chip--${variant} ${selected ? 'chip--selected' : ''} ${isClickable ? 'chip--clickable' : ''} ${className}`}
      {...props}
    >
      {children || label}
    </Component>
  );
}

