import React from 'react';
import './States.css';

export default function LoadingState({ message = 'Loading...', inline = false }) {
  if (inline) {
    return (
      <div className="state-inline" role="status">
        <span className="spinner-ring" aria-hidden="true" />
        <span>{message}</span>
      </div>
    );
  }

  return (
    <div className="state-container" role="status">
      <div className="spinner-ring" aria-hidden="true" />
      <p className="state-message">{message}</p>
    </div>
  );
}

