'use client';

import { Feedback, ErrorTag, ERROR_TYPE_LABELS, ErrorType } from '@/types';

interface Props {
  feedback: Feedback;
  errorTags?: ErrorTag[];
}

export default function FeedbackView({ feedback, errorTags }: Props) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="font-semibold text-gray-900 mb-2">Overall Assessment</h3>
        <p className="text-gray-700 bg-blue-50 p-4 rounded-lg">
          {feedback.overall_comment}
        </p>
      </section>

      {feedback.strengths && feedback.strengths.length > 0 && (
        <section>
          <h3 className="font-semibold text-green-700 mb-2">Strengths</h3>
          <ul className="list-disc list-inside space-y-1 text-gray-700">
            {feedback.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>
      )}

      {feedback.main_problems && feedback.main_problems.length > 0 && (
        <section>
          <h3 className="font-semibold text-red-700 mb-2">Main Issues</h3>
          <ul className="list-disc list-inside space-y-1 text-gray-700">
            {feedback.main_problems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </section>
      )}

      {feedback.sentence_revisions &&
        feedback.sentence_revisions.length > 0 && (
          <section>
            <h3 className="font-semibold text-gray-900 mb-3">Sentence Corrections</h3>
            <div className="space-y-3">
              {feedback.sentence_revisions.map((rev, i) => (
                <div
                  key={i}
                  className="bg-gray-50 p-4 rounded-lg border border-gray-100"
                >
                  <div className="text-sm">
                    <span className="text-red-600 line-through">
                      {rev.original}
                    </span>
                  </div>
                  <div className="text-sm mt-1">
                    <span className="text-green-700">&rarr; {rev.revised}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {rev.explanation}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

      {errorTags && errorTags.length > 0 && (
        <section>
          <h3 className="font-semibold text-gray-900 mb-2">Error Types</h3>
          <div className="flex flex-wrap gap-2">
            {[...new Set(errorTags.map((t) => t.error_type))].map((type) => {
              const count = errorTags.filter(
                (t) => t.error_type === type
              ).length;
              return (
                <span
                  key={type}
                  className="px-3 py-1 bg-orange-50 text-orange-700 rounded-full text-sm"
                >
                  {ERROR_TYPE_LABELS[type as ErrorType] || type} &times; {count}
                </span>
              );
            })}
          </div>
        </section>
      )}

      {feedback.repeated_error_summary && feedback.repeated_error_summary.trim() !== '' && (
        <section>
          <h3 className="font-semibold text-amber-700 mb-2">Recurring Error Alert</h3>
          <p className="text-gray-700 bg-amber-50 p-4 rounded-lg border border-amber-100">
            {feedback.repeated_error_summary}
          </p>
        </section>
      )}

      {feedback.next_step_advice && (
        <section>
          <h3 className="font-semibold text-gray-900 mb-2">Next Steps</h3>
          <p className="text-gray-700 bg-green-50 p-4 rounded-lg">
            {feedback.next_step_advice}
          </p>
        </section>
      )}
    </div>
  );
}
