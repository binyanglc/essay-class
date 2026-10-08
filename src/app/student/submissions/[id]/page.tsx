'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { DEFAULT_MAX_DRAFTS, Submission, isMaxDrafts } from '@/types';
import FeedbackView from '@/components/FeedbackView';
import CompositionReview from '@/components/CompositionReview';
import HintsView from '@/components/HintsView';
import DraftProgress from '@/components/DraftProgress';
import type { DraftProblem } from '@/components/DraftProgress';
import { hasFeedback, loadStudentFeedback } from '@/lib/student-feedback';
import type { StudentFeedback } from '@/lib/student-feedback';
import { compositionId, draftNumber, draftProgress, itemsFromHints, itemsFromRevisions } from '@/lib/drafts';
import type { DraftItem, DraftStatus } from '@/lib/drafts';

type DraftRow = Pick<Submission, 'id' | 'created_at'> & { draft_number?: number };

/** The problems a draft's feedback marks, placed in its text. */
function itemsOf(text: string, f: StudentFeedback): DraftItem[] {
  if (f.kind === 'corrections') return itemsFromRevisions(text, f.feedback.sentence_revisions);
  if (f.kind === 'hints') return itemsFromHints(text, f.view.feedback.hints);
  return [];
}

export default function SubmissionDetailPage() {
  const { id } = useParams();
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [fb, setFb] = useState<StudentFeedback | null>(null);
  // All drafts of this composition (migration v17), and how many are allowed
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [maxDrafts, setMaxDrafts] = useState(DEFAULT_MAX_DRAFTS);
  // How the last draft's problems fared in this one
  const [progress, setProgress] = useState<{ problems: DraftProblem[]; statuses: Map<string, DraftStatus>; prev: number } | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    // Switching drafts quickly: only the last one opened is shown
    let cancelled = false;
    async function load() {
      setLoading(true);
      setProgress(null);
      const { data: sub } = await supabase.from('submissions').select('*').eq('id', id).single();
      if (cancelled) return;
      setSubmission(sub);
      if (!sub) {
        setLoading(false);
        return;
      }
      const root = compositionId(sub);
      const [current, { data: rows }, { data: proj }] = await Promise.all([
        loadStudentFeedback(supabase, sub.id),
        supabase
          .from('submissions')
          .select('id, draft_number, created_at, final_text')
          .or(`id.eq.${root},first_draft_id.eq.${root}`)
          .order('draft_number', { ascending: true }),
        sub.project_id
          ? supabase.from('projects').select('max_drafts').eq('id', sub.project_id).single()
          : Promise.resolve({ data: null }),
      ]);
      if (cancelled) return;
      setFb(current);
      const list = ((rows ?? []) as (DraftRow & { final_text: string })[]).sort((a, b) => draftNumber(a) - draftNumber(b));
      setDrafts(list);
      if (isMaxDrafts(proj?.max_drafts)) setMaxDrafts(proj.max_drafts);

      // A later draft: compare with the one before
      const n = draftNumber(sub);
      const prev = list.find((d) => draftNumber(d) === n - 1);
      if (prev && hasFeedback(current)) {
        const prevFb = await loadStudentFeedback(supabase, prev.id);
        if (cancelled) return;
        const prevItems = itemsOf(prev.final_text, prevFb);
        const nextItems = itemsOf(sub.final_text, current);
        setProgress({
          problems: prevItems.map((p) => ({ id: p.id, original: p.original, marks: prevFb.kind === 'hints' ? p.marks : undefined })),
          statuses: draftProgress(prev.final_text, prevItems, sub.final_text, nextItems),
          prev: n - 1,
        });
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (!submission) return <p className="text-red-500">Submission not found</p>;

  const n = draftNumber(submission);
  const latest = Math.max(1, ...drafts.map((d) => draftNumber(d)));
  const isLatest = n === latest;
  const canRevise = isLatest && hasFeedback(fb) && n < maxDrafts;
  const finished = isLatest && hasFeedback(fb) && n >= maxDrafts && maxDrafts > 1;
  const hintView = fb?.kind === 'hints' ? fb.view : null;
  const feedback = fb?.kind === 'corrections' ? fb.feedback : null;
  const errorTags = fb?.kind === 'corrections' ? fb.tags : [];

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Link href="/student/submissions" className="text-sm text-gray-500 hover:text-gray-700">
          &larr; Back to list
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex justify-between items-start mb-4 gap-3">
          <div>
            <h1 className="text-xl font-bold">{submission.title || submission.assignment_name || 'Untitled'}</h1>
            {submission.assignment_name && <span className="text-sm text-gray-500">{submission.assignment_name}</span>}
          </div>
          <span className="text-xs text-gray-400 whitespace-nowrap">
            {new Date(submission.created_at).toLocaleString('en-US')}
          </span>
        </div>

        {drafts.length > 1 && (
          <nav aria-label="Drafts" className="mb-4 flex flex-wrap items-center gap-1.5 text-xs">
            {drafts.map((d) =>
              d.id === submission.id ? (
                <span key={d.id} className="rounded-full bg-blue-600 px-2.5 py-1 font-medium text-white">
                  Draft {draftNumber(d)}
                </span>
              ) : (
                <Link
                  key={d.id}
                  href={`/student/submissions/${d.id}`}
                  className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-700 hover:bg-gray-200"
                >
                  Draft {draftNumber(d)}
                </Link>
              )
            )}
          </nav>
        )}

        {progress && (
          <div className="mb-5">
            <DraftProgress problems={progress.problems} statuses={progress.statuses} prevLabel={`draft ${progress.prev}`} />
          </div>
        )}

        {hintView ? (
          <HintsView
            text={submission.final_text}
            view={hintView}
            imagePath={submission.image_path}
            label={n > 1 ? `Your Composition — draft ${n}` : 'Your Composition'}
          />
        ) : (
          <CompositionReview
            text={submission.final_text}
            imagePath={submission.image_path}
            revisions={feedback ? feedback.sentence_revisions ?? [] : null}
            partial={!!feedback && !feedback.correction_level}
            errorTags={errorTags}
            role="student"
            feedbackId={feedback?.id}
            label={n > 1 ? `Your Composition — draft ${n}` : 'Your Composition'}
          />
        )}

        {canRevise && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50/50 px-4 py-3 text-sm">
            <span className="text-gray-700">
              {hintView
                ? 'When you’re ready, fix the problems in your composition and submit it again.'
                : 'Use the feedback to improve your composition and submit it again.'}{' '}
              <span className="text-gray-400">
                (Draft {n + 1} of {maxDrafts})
              </span>
            </span>
            <Link
              href={`/student/submissions/${submission.id}/revise`}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Revise my composition
            </Link>
          </div>
        )}
        {finished && (
          <p className="mt-5 rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">
            This was your last draft for this assignment. Your teacher will go over the remaining problems in class.
          </p>
        )}
        {!isLatest && (
          <p className="mt-5 rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">
            This is an earlier draft.{' '}
            <Link href={`/student/submissions/${drafts[drafts.length - 1]?.id}`} className="font-medium text-blue-600 hover:underline">
              See your latest draft
            </Link>
          </p>
        )}
      </div>

      {hintView ? (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-bold mb-4">Feedback</h2>
          <FeedbackView
            feedback={{
              ...hintView.feedback,
              sentence_revisions: [],
              strengths: [],
              main_problems: [],
              repeated_error_summary: '',
              next_step_advice: '',
            }}
            errorTags={hintView.tags.map((t) => ({
              ...t,
              original_text: t.original_text ?? '',
              pattern_name: '',
              suggested_revision: '',
              explanation: '',
              improvement_tip: '',
              sentence_index: null,
            }))}
            showLabels={false}
          />
        </div>
      ) : feedback ? (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-bold mb-4">Feedback</h2>
          <FeedbackView
            feedback={feedback}
            errorTags={errorTags}
            compositionText={submission.final_text}
            revisions={feedback.sentence_revisions}
          />
        </div>
      ) : fb?.kind === 'in-review' ? (
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
