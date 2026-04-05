'use client';

import { ERROR_TYPE_LABELS, ErrorType } from '@/types';

interface ClassError {
  error_type: ErrorType;
  count: number;
  examples: { original: string; revision: string; explanation: string }[];
}

interface Props {
  errors: ClassError[];
  totalSubmissions: number;
}

export default function ClassIssues({ errors, totalSubmissions }: Props) {
  if (errors.length === 0) {
    return (
      <p className="text-gray-500 text-center py-12">No submission data yet</p>
    );
  }

  return (
    <div className="space-y-8">
      <p className="text-sm text-gray-500">
        Based on {totalSubmissions} recent submissions
      </p>

      {errors.slice(0, 5).map((e, idx) => (
        <div
          key={e.error_type}
          className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl font-bold text-blue-600">
              #{idx + 1}
            </span>
            <div>
              <h3 className="font-semibold text-lg">
                {ERROR_TYPE_LABELS[e.error_type]}
              </h3>
              <p className="text-sm text-gray-500">{e.count} occurrences</p>
            </div>
          </div>

          <div className="space-y-3">
            {e.examples.map((ex, i) => (
              <div key={i} className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm text-red-600 line-through">
                  {ex.original}
                </div>
                <div className="text-sm text-green-700 mt-1">
                  &rarr; {ex.revision}
                </div>
                {ex.explanation && (
                  <div className="text-xs text-gray-500 mt-2">
                    {ex.explanation}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
