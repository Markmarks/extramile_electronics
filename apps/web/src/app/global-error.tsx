'use client';

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          display: 'flex',
          minHeight: '100vh',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          textAlign: 'center',
        }}
      >
        <h1>Something went wrong</h1>
        <p>The app hit an unexpected error.</p>
        <button
          onClick={reset}
          style={{ padding: '0.5rem 1rem', borderRadius: '0.375rem', border: '1px solid #ccc' }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
