import React, { useId } from 'react';
import './Input.css';

export default function Select({
  label,
  helperText,
  error,
  id: providedId,
  required = false,
  options = [], // [{ value: '...', label: '...' }]
  placeholder = 'Select an option...',
  className = '',
  value,
  onChange,
  ...props
}) {
  const generatedId = useId();
  const selectId = providedId || generatedId;
  const errorId = `${selectId}-error`;
  const helperId = `${selectId}-helper`;

  return (
    <div className={`form-field ${className}`}>
      {label && (
        <label htmlFor={selectId} className="form-label">
          {label}
          {required && <span className="form-required" aria-hidden="true"> *</span>}
        </label>
      )}

      <div className={`input-wrapper ${error ? 'has-error' : ''}`}>
        <select
          id={selectId}
          required={required}
          value={value}
          onChange={onChange}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : helperText ? helperId : undefined}
          className="form-input"
          style={{ cursor: 'pointer', appearance: 'auto' }}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
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

