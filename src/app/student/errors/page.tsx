'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ERROR_TYPE_LABELS } from '@/types';
import { loadStudentPatterns } from '@/lib/error-patterns';
import type { StudentPatterns } from '@/lib/error-patterns';
import { FocusList, PatternFamilyCard } from '@/components/ErrorPatterns';

export default function StudentErrorsPage() {
  const [data, setData] = useState<StudentPatterns | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const patterns = await loadStudentPatterns(supabase, user.id);
      setData(patterns);
      // The first thing to work on starts open
      if (patterns.focus[0]) setOpen(new Set([patterns.focus[0].key]));
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data) return <p className="text-gray-500">Loading...</p>;

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const pick = (key: string) => {
    setOpen((prev) => new Set(prev).add(key));
    requestAnimationFrame(() => document.getElementById(`pattern-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">My Error Patterns</h1>
      <p className="mb-6 text-sm text-gray-500">
        What keeps going wrong in your writing: your own sentences, why, and how to use the right words. Each problem counts once
        per composition (your first drafts).
        {data.unchecked > 0 && (
          <>
            {' '}
            Problems marked{' '}
            <span className="rounded bg-white px-1 text-[9px] font-semibold uppercase tracking-wide ring-1 ring-inset ring-gray-200">
              AI
            </span>{' '}
            haven&apos;t been checked by your teacher yet.
          </>
        )}
      </p>

      {data.groups.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-500">
            Submit more compositions and your error patterns will appear here with specific examples to help you improve.
          </p>
        </div>
      ) : (
        <>
          <FocusList families={data.focus} onPick={pick} />
          <div className="space-y-8">
            {data.groups.map((g) => (
              <section key={g.error_type}>
                <div className="mb-3 flex items-center gap-3">
                  <h2 className="text-lg font-semibold text-gray-900">{ERROR_TYPE_LABELS[g.error_type] || g.error_type}</h2>
                  <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">{g.count} total</span>
                </div>
                <div className="space-y-3">
                  {g.families.map((f) => (
                    <PatternFamilyCard key={f.key} f={f} open={open.has(f.key)} onToggle={() => toggle(f.key)} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
