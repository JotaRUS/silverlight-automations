'use client';

import type { CSSProperties } from 'react';

/**
 * Root-level error UI: must not rely on Tailwind or `globals.css` — when this renders,
 * the root layout (and its CSS imports) may not have loaded.
 */
export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): JSX.Element {
  const body: CSSProperties = {
    margin: 0,
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
  };

  const card: CSSProperties = {
    maxWidth: '28rem',
    width: '100%',
    boxSizing: 'border-box',
    padding: '2rem',
    borderRadius: '0.75rem',
    border: '1px solid #e2e8f0',
    backgroundColor: '#ffffff',
    boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.1)',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem'
  };

  const title: CSSProperties = {
    margin: 0,
    fontSize: '1.125rem',
    fontWeight: 600,
    color: '#0f172a'
  };

  const message: CSSProperties = {
    margin: 0,
    fontSize: '0.875rem',
    lineHeight: 1.5,
    color: '#64748b',
    wordBreak: 'break-word'
  };

  const button: CSSProperties = {
    cursor: 'pointer',
    border: 'none',
    borderRadius: '0.5rem',
    backgroundColor: '#0f172a',
    color: '#ffffff',
    fontSize: '0.875rem',
    fontWeight: 500,
    padding: '0.5rem 1rem',
    alignSelf: 'center'
  };

  return (
    <html lang="en">
      <body style={body}>
        <div style={card}>
          <h2 style={title}>Something went wrong</h2>
          <p style={message}>{error.message || 'An unexpected error occurred.'}</p>
          <button type="button" style={button} onClick={reset}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
