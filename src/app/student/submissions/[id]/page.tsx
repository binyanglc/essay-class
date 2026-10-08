'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Submission, Feedback, ErrorTag } from '@/types';
import FeedbackView from '@/components/FeedbackView';
import { isActive } from '@/lib/error-taxonomy';
import CompositionReview from '@/components/CompositionReview';
import { submissionsInReview } from '@/lib/feedback-release';

export default function SubmissionDetailPage() {
  const { id } = useParams();
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [errorTags, setErrorTags] = useState<ErrorTag[]>([]);
  // The teacher checks the feedback first and hasn't released it yet
  const [inReview, setInReview] = useState(false);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: sub } = await supabase
        .from('submissions')
        .select('*')
        .eq('id', id)
        .single();
      setSubmission(sub);

      if (sub) {
        const { data: fb } = await supabase
          .from('feedback')
          .select('*')
          .eq('submission_id', sub.id)
          .single();
        setFeedback(fb);
        if (!fb) setInReview((await submissionsInReview(supabase)).has(sub.id));

        const { data: tags } = await supabase
          .from('error_tags')
          .select('*')
          .eq('submission_id', sub.id);
        setErrorTags(((tags || []) as ErrorTag[]).filter(isActive));
      }
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (!submission) return <p className="text-red-500">Submission not found</p>;

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Link
          href="/student/submissions"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          &larr; Back to list
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-xl font-bold">
              {submission.title || submission.assignment_name || 'Untitled'}
            </h1>
            {submission.assignment_name && (
              <span className="text-sm text-gray-500">
                {submission.assignment_name}
              </span>
            )}
          </div>
          <span className="text-xs text-gray-400">
            {new Date(submission.created_at).toLocaleString('en-US')}
          </span>
        </div>

        <CompositionReview
          text={submission.final_text}
          imagePath={submission.image_path}
          revisions={feedback ? feedback.sentence_revisions ?? [] : null}
          partial={!!feedback && !feedback.correction_level}
          errorTags={errorTags}
          role="student"
          feedbackId={feedback?.id}
          label="Your Composition"
        />
      </div>

      {feedback ? (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-bold mb-4">Feedback</h2>
          <FeedbackView
            feedback={feedback}
            errorTags={errorTags}
            compositionText={submission.final_text}
            revisions={feedback.sentence_revisions}
          />
        </div>
      ) : inReview ? (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
          <p className="font-medium text-blue-900">Your teacher is checking the feedback</p>
          <p className="mt-1 text-sm text-blue-800">
            You&apos;ll see the feedback on this composition here as soon as your teacher releases it.
          </p>
        </div>
      ) : (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5">
          <p className="text-yellow-800">
            Feedback has not been generated yet. There may have been an issue with the AI. Please contact your teacher.
          </p>
        </div>
      )}
    </div>
  );
}
