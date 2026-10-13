'use client';

import { useEffect, useState } from 'react';

/**
 * Shown while a submission waits for the AI feedback. With a model that
 * thinks first (e.g. gpt-6-luna) that takes about a minute, so the student
 * sees the time passing instead of a fixed promise.
 */
export default function FeedbackWaiting() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const note =
    seconds < 75
      ? 'This usually takes about a minute.'
      : 'Still working — long compositions take a little longer.';

  return (
    <div role="status" className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-blue-500" aria-hidden />
        <span className="font-medium">The AI is reading your composition…</span>
        {/* Not read out every second by screen readers */}
        <span className="ml-auto tabular-nums text-blue-700" aria-hidden>
          {clock}
        </span>
      </div>
      <p className="mt-1 text-blue-800">{note} Please keep this page open.</p>
    </div>
  );
}
