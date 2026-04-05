'use client';

import { ErrorFrequency, ERROR_TYPE_LABELS } from '@/types';
import { categorizeErrorFrequency } from '@/lib/error-tracking';

interface Props {
  errors: ErrorFrequency[];
  title?: string;
}

export default function ErrorSummary({
  errors,
  title = 'Common Error Types',
}: Props) {
  if (errors.length === 0) {
    return <p className="text-gray-500 text-sm">No error records yet</p>;
  }

  const maxCount = Math.max(...errors.map((e) => e.count));

  return (
    <div>
      <h3 className="font-semibold text-gray-900 mb-4">{title}</h3>
      <div className="space-y-3">
        {errors.slice(0, 10).map((e) => (
          <div key={e.error_type}>
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm font-medium text-gray-700">
                {ERROR_TYPE_LABELS[e.error_type]}
              </span>
              <span className="text-xs text-gray-500">
                {e.count}x &middot; {categorizeErrorFrequency(e.count)}
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5">
              <div
                className="bg-blue-500 h-2.5 rounded-full transition-all"
                style={{ width: `${(e.count / maxCount) * 100}%` }}
              />
            </div>
            {e.examples.length > 0 && (
              <div className="mt-1.5 space-y-1">
                {e.examples.slice(0, 2).map((ex, i) => (
                  <div key={i} className="text-xs text-gray-500">
                    <span className="text-red-500">{ex.original}</span>
                    {ex.revision && (
                      <span className="text-green-600">
                        {' '}
                        &rarr; {ex.revision}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
