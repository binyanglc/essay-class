'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ErrorFrequency, ERROR_TYPE_LABELS, ErrorType } from '@/types';
import { getStudentErrorHistory, categorizeErrorFrequency } from '@/lib/error-tracking';

export default function StudentErrorsPage() {
  const [errors, setErrors] = useState<ErrorFrequency[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedType, setExpandedType] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const history = await getStudentErrorHistory(supabase, user.id);
      setErrors(history);
      if (history.length > 0) {
        setExpandedType(history[0].error_type);
      }
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">My Error Patterns</h1>
      <p className="text-sm text-gray-500 mb-6">
        Review your recurring mistakes with real examples from your past submissions.
      </p>

      {errors.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500">
            Submit more compositions and your error patterns will appear here
            with specific examples to help you improve.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {errors.map((e) => {
            const isExpanded = expandedType === e.error_type;
            const label =
              ERROR_TYPE_LABELS[e.error_type as ErrorType] || e.error_type;
            const frequency = categorizeErrorFrequency(e.count);

            return (
              <div
                key={e.error_type}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden"
              >
                {/* Header — always visible */}
                <button
                  onClick={() =>
                    setExpandedType(isExpanded ? null : e.error_type)
                  }
                  className="w-full flex justify-between items-center p-4 hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        e.count >= 5
                          ? 'bg-red-50 text-red-700'
                          : e.count >= 3
                          ? 'bg-orange-50 text-orange-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {e.count}x
                    </span>
                    <span className="font-medium text-sm">{label}</span>
                    <span className="text-xs text-gray-400">{frequency}</span>
                  </div>
                  <svg
                    className={`w-4 h-4 text-gray-400 transition-transform ${
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

                {/* Expanded — real examples */}
                {isExpanded && e.examples.length > 0 && (
                  <div className="px-4 pb-4 border-t border-gray-100">
                    <p className="text-xs text-gray-400 mt-3 mb-3">
                      Examples from your past submissions:
                    </p>
                    <div className="space-y-3">
                      {e.examples.map((ex, i) => (
                        <div
                          key={i}
                          className="bg-gray-50 rounded-lg p-3"
                        >
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
                        </div>
                      ))}
                    </div>

                    {/* Study tip based on error type */}
                    <div className="mt-3 bg-blue-50 rounded-lg p-3">
                      <p className="text-xs text-blue-700">
                        <span className="font-medium">Study tip: </span>
                        {getStudyTip(e.error_type as ErrorType)}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function getStudyTip(errorType: ErrorType): string {
  const tips: Record<ErrorType, string> = {
    vocabulary:
      'Review the specific words you used incorrectly above. Try writing 3 new sentences using the correct word in different contexts.',
    grammar:
      'Look at the sentence patterns in the corrections above. Practice rewriting similar sentences, paying attention to word order and grammatical particles.',
    content:
      'Before writing, make an outline with your main argument and 2-3 supporting examples. Make sure each paragraph has a clear point.',
    structure:
      'Practice using transition words (首先、其次、最后、另外、总之) to connect your ideas. Read your essay aloud to check if it flows.',
    characters:
      'Write out the correct characters from the examples above 5 times each. Pay attention to similar-looking characters.',
    punctuation:
      'Review Chinese punctuation rules: use 。for periods, ，for commas, and ？for questions. Pay attention to where you place them.',
  };
  return tips[errorType] || 'Review the examples above and practice writing similar sentences correctly.';
}
