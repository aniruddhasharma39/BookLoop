import React from 'react';
import './Skeleton.css';

export default function Skeleton({
  variant = 'text', // 'text' | 'rect' | 'circle' | 'card'
  width,
  height,
  className = '',
  style = {},
}) {
  if (variant === 'card') {
    return (
      <div className={`skeleton-card ${className}`} style={{ width, ...style }}>
        <div className="skeleton-box skeleton-card__image" />
        <div className="skeleton-card__body">
          <div className="skeleton-box skeleton-card__line skeleton-card__line--price" />
          <div className="skeleton-box skeleton-card__line skeleton-card__line--title" />
          <div className="skeleton-box skeleton-card__line skeleton-card__line--sub" />
          <div className="skeleton-box skeleton-card__line skeleton-card__line--footer" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`skeleton-box skeleton--${variant} ${className}`}
      style={{
        width: width || (variant === 'text' ? '100%' : undefined),
        height: height || (variant === 'text' ? '1rem' : undefined),
        ...style,
      }}
      aria-hidden="true"
    />
  );
}

