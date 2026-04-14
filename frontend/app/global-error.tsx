'use client';

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): JSX.Element {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-slate-50 font-sans">
        <div className="max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm text-center space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Something went wrong</h2>
          <p className="text-sm text-slate-500">{error.message || 'An unexpected error occurred.'}</p>
          <button
            onClick={reset}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
