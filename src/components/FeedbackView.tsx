'use client';

import { Feedback, ErrorTag, ErrorType } from '@/types';

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

  const characterErrors = groupedErrors.get('characters') || [];
  const vocabErrors = groupedErrors.get('vocabulary') || [];
  const grammarErrors = groupedErrors.get('grammar') || [];

  return (
    <div className="space-y-6">
      {/* Overall Assessment */}
      <section>
        <h3 className="font-semibold text-gray-900 mb-2">Overall Assessment</h3>
        <p className="text-gray-700 bg-blue-50 p-4 rounded-lg">
          {feedback.overall_comment}
        </p>
      </section>

      {/* Sentence Corrections */}
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

      {/* Characters */}
      <section>
        <h3 className="font-semibold text-gray-900 mb-2">Characters</h3>
        <SectionComment
          comment={feedback.characters_comment}
          hasErrors={characterErrors.length > 0}
        />
        {characterErrors.length > 0 && (
          <div className="space-y-2 mt-2">
            {characterErrors.map((tag, i) => (
              <ErrorTagCard key={i} tag={tag} />
            ))}
          </div>
        )}
      </section>

      {/* Vocabulary & Word Choice */}
      <section>
        <h3 className="font-semibold text-gray-900 mb-2">Vocabulary & Word Choice</h3>
        <SectionComment
          comment={feedback.vocabulary_comment}
          hasErrors={vocabErrors.length > 0}
        />
        {vocabErrors.length > 0 && (
          <div className="space-y-2 mt-2">
            {vocabErrors.map((tag, i) => (
              <ErrorTagCard key={i} tag={tag} />
            ))}
          </div>
        )}
      </section>

      {/* Grammar */}
      <section>
        <h3 className="font-semibold text-gray-900 mb-2">Grammar</h3>
        <SectionComment
          comment={feedback.grammar_comment}
          hasErrors={grammarErrors.length > 0}
        />
        {grammarErrors.length > 0 && (
          <div className="space-y-2 mt-2">
            {grammarErrors.map((tag, i) => (
              <ErrorTagCard key={i} tag={tag} />
            ))}
          </div>
        )}
      </section>

      {/* Content & Ideas */}
      <section>
        <h3 className="font-semibold text-gray-900 mb-2">Content & Ideas</h3>
        <SectionComment
          comment={feedback.content_feedback}
          hasErrors={false}
        />
      </section>

      {/* Organization & Structure */}
      <section>
        <h3 className="font-semibold text-gray-900 mb-2">Organization & Structure</h3>
        <SectionComment
          comment={feedback.structure_feedback}
          hasErrors={false}
        />
      </section>
    </div>
  );
}

function SectionComment({ comment, hasErrors }: { comment?: string; hasErrors: boolean }) {
  if (!comment) return null;
  return (
    <p className={`text-sm p-3 rounded-lg ${
      hasErrors
        ? 'text-gray-700 bg-gray-50'
        : 'text-green-700 bg-green-50'
    }`}>
      {comment}
    </p>
  );
}

function ErrorTagCard({ tag }: { tag: ErrorTag }) {
  return (
    <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
      {tag.pattern_name && (
        <span className="text-xs text-blue-600 font-medium">{tag.pattern_name}</span>
      )}
      <div className="text-sm mt-1">
        <span className="text-red-600 line-through">{tag.original_text}</span>
        <span className="text-green-700 ml-2">&rarr; {tag.suggested_revision}</span>
      </div>
      <p className="text-xs text-gray-500 mt-1">{tag.explanation}</p>
    </div>
  );
}
