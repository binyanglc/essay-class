'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ERROR_TYPE_LABELS } from '@/types';
import { categorizeByEssays, getStudentLabelSummary } from '@/lib/error-tracking';
import type { FamilySummary, IssueGroup } from '@/lib/error-tracking';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default function StudentErrorsPage() {
  const [groups, setGroups] = useState<IssueGroup[]>([]);
  const [unchecked, setUnchecked] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const summary = await getStudentLabelSummary(supabase, user.id);
      setGroups(summary.groups);
      setUnchecked(summary.unchecked);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <p className="text-gray-500">Loading...</p>;

  const family = (f: FamilySummary) => {
    const isExpanded = expanded === f.key;
    return (
      <div key={f.key} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <button
          onClick={() => setExpanded(isExpanded ? null : f.key)}
          aria-expanded={isExpanded}
          className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-gray-50"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                f.essays >= 3
                  ? 'bg-red-50 text-red-700'
                  : f.essays === 2
                  ? 'bg-orange-50 text-orange-700'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {f.count}x
            </span>
            <div className="min-w-0">
              <span className="block truncate text-sm font-medium">
                {f.name}
                {f.zh && f.zh !== f.name && <span className="ml-1.5 font-normal text-gray-500">{f.zh}</span>}
              </span>
              <span className="text-xs text-gray-400">{categorizeByEssays(f.essays)}</span>
            </div>
          </div>
          <svg
            className={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* The exact words or rules, so it's clear what keeps going wrong */}
        {f.items.length > 0 && (
          <div className="-mt-1 flex flex-wrap gap-1.5 px-4 pb-3">
            {f.items.slice(0, 6).map((it) => (
              <span key={it.key} className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-700">
                {it.name}
                <span className="ml-1 text-gray-400">
                  &times;{it.count}
                  {it.essays > 1 ? ` · ${plural(it.essays, 'composition')}` : ''}
                </span>
              </span>
            ))}
          </div>
        )}

        {isExpanded && (
          <div className="border-t border-gray-100 px-4 pb-4">
            <p className="mb-3 mt-3 text-xs text-gray-400">Examples from your compositions:</p>
            <div className="space-y-3">
              {f.examples.map((ex) => (
                <div key={ex.id} className="rounded-lg bg-gray-50 p-3">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs font-medium text-blue-600">
                    {ex.label}
                    {ex.unchecked && (
                      <span
                        title="AI suggestion — your teacher hasn't checked it yet"
                        className="rounded bg-white px-1 text-[9px] font-semibold uppercase tracking-wide text-gray-500 ring-1 ring-inset ring-gray-200"
                      >
                        AI
                      </span>
                    )}
                  </div>
                  {ex.original && <div className="text-sm text-red-600 line-through">{ex.original}</div>}
                  {ex.revision && <div className="mt-1 text-sm text-green-700">&rarr; {ex.revision}</div>}
                  {ex.explanation && <p className="mt-1 text-xs text-gray-500">{ex.explanation}</p>}
                </div>
              ))}
            </div>

            {f.tip && (
              <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-3">
                <p className="text-xs text-blue-800">
                  <span className="font-semibold">What this is about: </span>
                  {f.tip}
                </p>
              </div>
            )}

            <div className="mt-3 rounded-lg border border-green-100 bg-green-50 p-3">
              <p className="text-xs text-green-800">
                <span className="font-semibold">Practice: </span>
                Try rewriting the incorrect examples above correctly, then write 2 new sentences using the same pattern.
              </p>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">My Error Patterns</h1>
      <p className="mb-6 text-sm text-gray-500">
        Your errors grouped by kind, with the exact words and rules that keep coming up, real examples, and study tips.
        {unchecked > 0 && (
          <>
            {' '}
            Examples marked{' '}
            <span className="rounded bg-white px-1 text-[9px] font-semibold uppercase tracking-wide ring-1 ring-inset ring-gray-200">
              AI
            </span>{' '}
            haven&apos;t been checked by your teacher yet.
          </>
        )}
      </p>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-500">
            Submit more compositions and your error patterns will appear here with specific examples to help you improve.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.error_type}>
              <div className="mb-3 flex items-center gap-3">
                <h2 className="text-lg font-semibold text-gray-900">{ERROR_TYPE_LABELS[g.error_type] || g.error_type}</h2>
                <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">{g.count} total</span>
              </div>
              <div className="space-y-3">{g.families.map(family)}</div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
