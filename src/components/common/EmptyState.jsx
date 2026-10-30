import React from 'react';
import { BookOpen } from 'lucide-react';
import Button from './Button';
import './States.css';

export default function EmptyState({
  icon: Icon = BookOpen,
  title = 'No books found',
  description = 'There are no listings matching your criteria yet.',
  actionLabel,
  onAction,
}) {
  return (
    <div className="state-container empty-state">
      <div className="empty-state__icon-box" aria-hidden="true">
        <Icon size={32} />
      </div>
      <h3 className="empty-state__title">{title}</h3>
      <p className="state-message empty-state__desc">{description}</p>
      {actionLabel && onAction && (
        <Button variant="secondary" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

