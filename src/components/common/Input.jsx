import React, { useId } from 'react';
import './Input.css';

export default function Input({
  label,
  helperText,
  error,
  type = 'text',
  id: providedId,
  required = false,
  className = '',
  prefix,
  suffix,
  ...props
}) {
  const generatedId = useId();
  const inputId = providedId || generatedId;
  const errorId = `${inputId}-error`;
  const helperId = `${inputId}-helper`;

  return (
    <div className={`form-field ${className}`}>
      {label && (
        <label htmlFor={inputId} className="form-label">
          {label}
          {required && <span className="form-required" aria-hidden="true"> *</span>}
        </label>
      )}

      <div className={`input-wrapper ${prefix ? 'has-prefix' : ''} ${suffix ? 'has-suffix' : ''} ${error ? 'has-error' : ''}`}>
        {prefix && <span className="input-affix input-prefix">{prefix}</span>}
        <input
          id={inputId}
          type={type}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : helperText ? helperId : undefined}
          className="form-input"
          {...props}
        />
        {suffix && <span className="input-affix input-suffix">{suffix}</span>}
      </div>

      {error ? (
        <p id={errorId} className="form-feedback form-feedback--error" role="alert">
          {error}
        </p>
      ) : helperText ? (
        <p id={helperId} className="form-feedback form-feedback--helper">
          {helperText}
        </p>
      ) : null}
    </div>
  );
}

