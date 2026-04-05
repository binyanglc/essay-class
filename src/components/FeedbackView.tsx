'use client';

import { Feedback, ErrorTag, ERROR_TYPE_LABELS, ERROR_TYPE_ORDER, ErrorType } from '@/types';

interface Props {
  feedback: Feedback;
  errorTags?: ErrorTag[];
}

export default function FeedbackView({ feedback, errorTags }: Props) {
  const groupedErrors = new Map<ErrorType, ErrorTag[]>();
  if (errorTags) {
    for (const tag of errorTags) {
      const list = groupedErrors.get(tag.error_type as ErrorType) || [];
      list.push(tag);
      groupedErrors.set(tag.error_type as ErrorType, list);
    }
  }

  return (
    <div className="space-y-6">
      {/* Overall Assessment */}
      <section>
        <h3 className="font-semibold text-gray-900 mb-2">Overall Assessment</h3>
        <p className="text-gray-700 bg-blue-50 p-4 rounded-lg">
          {feedback.overall_comment}
        </p>
      </section>

      {/* Strengths */}
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

      {/* Sentence Corrections — the most valuable section */}
      {feedback.sentence_revisions && feedback.sentence_revisions.length > 0 && (
        <section>
          <h3 className="font-semibold text-gray-900 mb-3">Sentence Corrections</h3>
          <div className="space-y-3">
            {feedback.sentence_revisions.map((rev, i) => (
              <div key={i} className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                <div className="text-sm">
                  <span className="text-red-600 line-through">{rev.original}</span>
                </div>
                <div className="text-sm mt-1">
                  <span className="text-green-700">&rarr; {rev.revised}</span>
                </div>
                <p className="text-xs text-gray-500 mt-2">{rev.explanation}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Content & Ideas */}
      {feedback.content_feedback && feedback.content_feedback.trim() !== '' && (
        <section>
          <h3 className="font-semibold text-purple-700 mb-2">Content & Ideas</h3>
          <p className="text-gray-700 bg-purple-50 p-4 rounded-lg border border-purple-100">
            {feedback.content_feedback}
          </p>
        </section>
      )}

      {/* Organization & Structure */}
      {feedback.structure_feedback && feedback.structure_feedback.trim() !== '' && (
        <section>
          <h3 className="font-semibold text-indigo-700 mb-2">Organization & Structure</h3>
          <p className="text-gray-700 bg-indigo-50 p-4 rounded-lg border border-indigo-100">
            {feedback.structure_feedback}
          </p>
        </section>
      )}

      {/* Error Types — organized by 6 categories */}
      {errorTags && errorTags.length > 0 && (
        <section>
          <h3 className="font-semibold text-gray-900 mb-3">Error Breakdown</h3>
          <div className="space-y-4">
            {ERROR_TYPE_ORDER.filter(type => groupedErrors.has(type)).map(type => {
              const tags = groupedErrors.get(type)!;
              return (
                <div key={type} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200">
                    <span className="font-medium text-sm text-gray-700">
                      {ERROR_TYPE_LABELS[type]}
                    </span>
                    <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs">
                      {tags.length}
                    </span>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {tags.map((tag, i) => (
                      <div key={i} className="px-4 py-3">
                        {tag.pattern_name && (
                          <span className="text-xs text-blue-600 font-medium">
                            {tag.pattern_name}
                          </span>
                        )}
                        <div className="text-sm mt-1">
                          <span className="text-red-600 line-through">{tag.original_text}</span>
                          <span className="text-green-700 ml-2">&rarr; {tag.suggested_revision}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{tag.explanation}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Recurring Error Alert */}
      {feedback.repeated_error_summary && feedback.repeated_error_summary.trim() !== '' && (
        <section>
          <h3 className="font-semibold text-amber-700 mb-2">Recurring Error Alert</h3>
          <p className="text-gray-700 bg-amber-50 p-4 rounded-lg border border-amber-100">
            {feedback.repeated_error_summary}
          </p>
        </section>
      )}

      {/* Next Steps */}
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
