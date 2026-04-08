'use client';

import { useEffect, useState } from 'react';
import { Feedback, ErrorTag, ErrorType, FeedbackComment, Profile } from '@/types';

interface Props {
  feedback: Feedback;
  errorTags?: ErrorTag[];
}

export default function FeedbackView({ feedback, errorTags }: Props) {
  const [comments, setComments] = useState<FeedbackComment[]>([]);

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

  useEffect(() => {
    loadComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedback.id]);

  async function loadComments() {
    const res = await fetch(`/api/feedback/${feedback.id}/comments`);
    if (res.ok) {
      const data = await res.json();
      setComments(data);
    }
  }

  function commentsForSection(section: string) {
    return comments.filter((c) => c.section === section);
  }

  return (
    <div className="space-y-6">
      {feedback.teacher_edited_at && (
        <p className="text-xs text-blue-600 bg-blue-50 px-3 py-2 rounded-lg">
          Reviewed by teacher &middot;{' '}
          {new Date(feedback.teacher_edited_at).toLocaleDateString('en-US')}
        </p>
      )}

      {/* Overall Assessment */}
      <section>
        <h3 className="font-semibold text-gray-900 mb-2">Overall Assessment</h3>
        <p className="text-gray-700 bg-blue-50 p-4 rounded-lg">
          {feedback.overall_comment}
        </p>
        <CommentThread
          feedbackId={feedback.id}
          section="overall"
          comments={commentsForSection('overall')}
          onRefresh={loadComments}
        />
      </section>

      {/* Sentence Corrections */}
      {feedback.sentence_revisions && feedback.sentence_revisions.length > 0 && (
        <section>
          <h3 className="font-semibold text-gray-900 mb-3">Sentence Corrections</h3>
          <div className="space-y-3">
            {feedback.sentence_revisions.map((rev, i) => (
              <div key={i}>
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                  <div className="text-sm">
                    <span className="text-red-600 line-through">{rev.original}</span>
                  </div>
                  <div className="text-sm mt-1">
                    <span className="text-green-700">&rarr; {rev.revised}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">{rev.explanation}</p>
                </div>
                <CommentThread
                  feedbackId={feedback.id}
                  section={`sentence_${i}`}
                  comments={commentsForSection(`sentence_${i}`)}
                  onRefresh={loadComments}
                />
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
        <CommentThread
          feedbackId={feedback.id}
          section="characters"
          comments={commentsForSection('characters')}
          onRefresh={loadComments}
        />
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
        <CommentThread
          feedbackId={feedback.id}
          section="vocabulary"
          comments={commentsForSection('vocabulary')}
          onRefresh={loadComments}
        />
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
        <CommentThread
          feedbackId={feedback.id}
          section="grammar"
          comments={commentsForSection('grammar')}
          onRefresh={loadComments}
        />
      </section>

      {/* Content & Ideas */}
      <section>
        <h3 className="font-semibold text-gray-900 mb-2">Content & Ideas</h3>
        <SectionComment
          comment={feedback.content_feedback}
          hasErrors={false}
        />
        <CommentThread
          feedbackId={feedback.id}
          section="content"
          comments={commentsForSection('content')}
          onRefresh={loadComments}
        />
      </section>

      {/* Organization & Structure */}
      <section>
        <h3 className="font-semibold text-gray-900 mb-2">Organization & Structure</h3>
        <SectionComment
          comment={feedback.structure_feedback}
          hasErrors={false}
        />
        <CommentThread
          feedbackId={feedback.id}
          section="structure"
          comments={commentsForSection('structure')}
          onRefresh={loadComments}
        />
      </section>
    </div>
  );
}

function CommentThread({
  feedbackId,
  section,
  comments,
  onRefresh,
}: {
  feedbackId: string;
  section: string;
  comments: FeedbackComment[];
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const handleSubmit = async () => {
    if (!message.trim()) return;
    setSending(true);
    const res = await fetch(`/api/feedback/${feedbackId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section, message }),
    });
    setSending(false);
    if (res.ok) {
      setMessage('');
      setOpen(false);
      onRefresh();
    }
  };

  const hasComments = comments.length > 0;

  return (
    <div className="mt-2">
      {hasComments && (
        <div className="ml-3 border-l-2 border-blue-100 pl-3 space-y-2 mb-2">
          {comments.map((c) => {
            const profile = c.profiles as unknown as Profile;
            const isTeacher = c.role === 'teacher';
            return (
              <div key={c.id} className={`text-xs p-2.5 rounded-lg ${
                isTeacher ? 'bg-blue-50' : 'bg-yellow-50'
              }`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`font-medium ${isTeacher ? 'text-blue-700' : 'text-yellow-700'}`}>
                    {profile?.name || (isTeacher ? 'Teacher' : 'Student')}
                  </span>
                  <span className="text-gray-300">&middot;</span>
                  <span className="text-gray-400">
                    {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-gray-700">{c.message}</p>
              </div>
            );
          })}
        </div>
      )}

      {open ? (
        <div className="ml-3 mt-1 space-y-2">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ask a question or share your thoughts..."
            rows={2}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-y"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={sending || !message.trim()}
              className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {sending ? 'Sending...' : 'Send'}
            </button>
            <button
              onClick={() => { setOpen(false); setMessage(''); }}
              className="text-xs text-gray-500 px-3 py-1.5"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="ml-3 text-xs text-gray-400 hover:text-blue-600 mt-1"
        >
          {hasComments ? '+ Reply' : '💬 Have a question?'}
        </button>
      )}
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
