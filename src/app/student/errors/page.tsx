'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ErrorPattern, ERROR_TYPE_LABELS, FEEDBACK_SECTION_ORDER, ErrorType } from '@/types';
import { getStudentErrorPatterns, categorizeErrorFrequency } from '@/lib/error-tracking';

export default function StudentErrorsPage() {
  const [patterns, setPatterns] = useState<ErrorPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPattern, setExpandedPattern] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const data = await getStudentErrorPatterns(supabase, user.id);
      setPatterns(data);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <p className="text-gray-500">Loading...</p>;

  const patternsByType = new Map<ErrorType, ErrorPattern[]>();
  for (const p of patterns) {
    const list = patternsByType.get(p.error_type) || [];
    list.push(p);
    patternsByType.set(p.error_type, list);
  }

  const typesPresent = FEEDBACK_SECTION_ORDER.filter((t) => patternsByType.has(t));
  const otherTypes = [...patternsByType.keys()].filter(
    (t) => !FEEDBACK_SECTION_ORDER.includes(t)
  );
  const allTypes = [...typesPresent, ...otherTypes];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">My Error Patterns</h1>
      <p className="text-sm text-gray-500 mb-6">
        Your errors grouped by category, with specific patterns, real examples, and study tips.
      </p>

      {patterns.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500">
            Submit more compositions and your error patterns will appear here
            with specific examples to help you improve.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {allTypes.map((type) => {
            const typePatterns = patternsByType.get(type) || [];
            const totalCount = typePatterns.reduce((sum, p) => sum + p.count, 0);

            return (
              <section key={type}>
                {/* Category header */}
                <div className="flex items-center gap-3 mb-3">
                  <h2 className="text-lg font-semibold text-gray-900">
                    {ERROR_TYPE_LABELS[type] || type}
                  </h2>
                  <span className="px-2.5 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
                    {totalCount} total
                  </span>
                </div>

                {/* Specific patterns under this category */}
                <div className="space-y-3">
                  {typePatterns.map((p) => {
                    const isExpanded = expandedPattern === p.pattern_name;
                    const frequency = categorizeErrorFrequency(p.count);

                    return (
                      <div
                        key={p.pattern_name}
                        className="bg-white rounded-xl border border-gray-200 overflow-hidden"
                      >
                        <button
                          onClick={() =>
                            setExpandedPattern(isExpanded ? null : p.pattern_name)
                          }
                          className="w-full flex justify-between items-center p-4 hover:bg-gray-50 transition-colors text-left"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span
                              className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-medium ${
                                p.count >= 5
                                  ? 'bg-red-50 text-red-700'
                                  : p.count >= 3
                                  ? 'bg-orange-50 text-orange-700'
                                  : 'bg-gray-100 text-gray-600'
                              }`}
                            >
                              {p.count}x
                            </span>
                            <div className="min-w-0">
                              <span className="font-medium text-sm block truncate">
                                {p.pattern_name}
                              </span>
                              <span className="text-xs text-gray-400">{frequency}</span>
                            </div>
                          </div>
                          <svg
                            className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${
                              isExpanded ? 'rotate-180' : ''
                            }`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 9l-7 7-7-7"
                            />
                          </svg>
                        </button>

                        {isExpanded && (
                          <div className="px-4 pb-4 border-t border-gray-100">
                            <p className="text-xs text-gray-400 mt-3 mb-3">
                              Examples from your past submissions:
                            </p>
                            <div className="space-y-3">
                              {p.examples.map((ex, i) => (
                                <div key={i} className="bg-gray-50 rounded-lg p-3">
                                  {ex.original && (
                                    <div className="text-sm text-red-600 line-through">
                                      {ex.original}
                                    </div>
                                  )}
                                  {ex.revision && (
                                    <div className="text-sm text-green-700 mt-1">
                                      &rarr; {ex.revision}
                                    </div>
                                  )}
                                  {ex.explanation && (
                                    <p className="text-xs text-gray-500 mt-1">
                                      {ex.explanation}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>

                            {p.improvement_tip && (
                              <div className="mt-3 bg-blue-50 rounded-lg p-3 border border-blue-100">
                                <p className="text-xs text-blue-800">
                                  <span className="font-semibold">Rule / Tip: </span>
                                  {p.improvement_tip}
                                </p>
                              </div>
                            )}

                            <div className="mt-3 bg-green-50 rounded-lg p-3 border border-green-100">
                              <p className="text-xs text-green-800">
                                <span className="font-semibold">Practice: </span>
                                Try rewriting the incorrect examples above correctly, then write 2 new sentences using the same pattern.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
