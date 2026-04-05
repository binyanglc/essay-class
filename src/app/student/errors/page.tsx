'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ErrorPattern, ERROR_TYPE_LABELS, ERROR_TYPE_ORDER, ErrorType } from '@/types';
import { getStudentErrorPatterns, categorizeErrorFrequency } from '@/lib/error-tracking';

export default function StudentErrorsPage() {
  const [patterns, setPatterns] = useState<ErrorPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPattern, setExpandedPattern] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<ErrorType | 'all'>('all');
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const data = await getStudentErrorPatterns(supabase, user.id);
      setPatterns(data);
      if (data.length > 0) {
        setExpandedPattern(data[0].pattern_name);
      }
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <p className="text-gray-500">Loading...</p>;

  const filteredPatterns =
    filterType === 'all'
      ? patterns
      : patterns.filter((p) => p.error_type === filterType);

  const typesPresent = [...new Set(patterns.map((p) => p.error_type))];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">My Error Patterns</h1>
      <p className="text-sm text-gray-500 mb-4">
        Your specific error patterns, grouped by type, with real examples and study tips.
      </p>

      {patterns.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500">
            Submit more compositions and your error patterns will appear here
            with specific examples to help you improve.
          </p>
        </div>
      ) : (
        <>
          {/* Filter tabs */}
          <div className="flex flex-wrap gap-2 mb-6">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filterType === 'all'
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              All ({patterns.length})
            </button>
            {ERROR_TYPE_ORDER.filter((t) => typesPresent.includes(t)).map((type) => {
              const count = patterns.filter((p) => p.error_type === type).length;
              return (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    filterType === type
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {ERROR_TYPE_LABELS[type]} ({count})
                </button>
              );
            })}
          </div>

          {/* Pattern cards */}
          <div className="space-y-4">
            {filteredPatterns.map((p) => {
              const isExpanded = expandedPattern === p.pattern_name;
              const frequency = categorizeErrorFrequency(p.count);

              return (
                <div
                  key={p.pattern_name}
                  className="bg-white rounded-xl border border-gray-200 overflow-hidden"
                >
                  {/* Header */}
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
                        <span className="text-xs text-gray-400">
                          {ERROR_TYPE_LABELS[p.error_type]} &middot; {frequency}
                        </span>
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

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-gray-100">
                      {/* Examples */}
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

                      {/* Rule / Improvement Tip */}
                      {p.improvement_tip && (
                        <div className="mt-3 bg-blue-50 rounded-lg p-3 border border-blue-100">
                          <p className="text-xs text-blue-800">
                            <span className="font-semibold">Rule / Tip: </span>
                            {p.improvement_tip}
                          </p>
                        </div>
                      )}

                      {/* Practice suggestion */}
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
        </>
      )}
    </div>
  );
}
