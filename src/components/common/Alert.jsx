import React from 'react';
import { AlertCircle, CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';
import './Alert.css';

export default function Alert({
  variant = 'info', // 'info' | 'success' | 'warning' | 'error'
  title,
  children,
  onClose,
  className = '',
}) {
  const icons = {
    info: <Info className="alert__icon" size={18} aria-hidden="true" />,
    success: <CheckCircle2 className="alert__icon" size={18} aria-hidden="true" />,
    warning: <AlertTriangle className="alert__icon" size={18} aria-hidden="true" />,
    error: <AlertCircle className="alert__icon" size={18} aria-hidden="true" />,
  };

  return (
    <div className={`alert alert--${variant} ${className}`} role={variant === 'error' ? 'alert' : 'status'}>
      <div className="alert__content-wrapper">
        {icons[variant]}
        <div className="alert__body">
          {title && <strong className="alert__title">{title}</strong>}
          <div className="alert__message">{children}</div>
        </div>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close notification"
          className="alert__close-btn"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}

