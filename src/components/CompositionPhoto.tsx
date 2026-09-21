'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const SIGNED_URL_SECONDS = 60 * 60;

/**
 * The photo a student uploaded, loaded through a short-lived signed URL
 * (the `compositions` bucket is private; access is checked by storage RLS).
 */
export default function CompositionPhoto({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    createClient()
      .storage.from('compositions')
      .createSignedUrl(path, SIGNED_URL_SECONDS)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.signedUrl) setStatus('error');
        else setUrl(data.signedUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (status === 'error') {
    return (
      <p className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
        The photo could not be loaded.
      </p>
    );
  }

  return (
    <div>
      {status === 'loading' && <p className="py-6 text-center text-sm text-gray-400">Loading photo...</p>}
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" title="Open full size">
          {/* Plain <img>: show the original upload at full resolution (no resizing) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt="Photo of the student's handwritten composition"
            onLoad={() => setStatus('loaded')}
            onError={() => setStatus('error')}
            className={`h-auto w-full rounded-md border border-gray-200 bg-white ${status === 'loading' ? 'hidden' : ''}`}
          />
        </a>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-gray-400">
          The typed text was recognized from this photo (OCR) and may have been edited by the student.
        </span>
        {url && status === 'loaded' && (
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
            Open full size &#8599;
          </a>
        )}
      </div>
    </div>
  );
}
