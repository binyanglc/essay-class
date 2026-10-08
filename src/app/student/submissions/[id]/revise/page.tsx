'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { DEFAULT_MAX_DRAFTS, Submission, isMaxDrafts } from '@/types';
import { hasFeedback, loadStudentFeedback } from '@/lib/student-feedback';
import type { StudentFeedback } from '@/lib/student-feedback';
import { compositionId, draftNumber } from '@/lib/drafts';
import { HINT_KIND_LABELS, kindsOf, placeHints } from '@/lib/hints';
import { placeRevisions } from '@/lib/track-changes';
import { withRevisionIds } from '@/lib/revisions';
import { HintSentence } from '@/components/HintsView';
import { DiffOps, NumberBadge } from '@/components/TrackChangesView';

/** What to fix, next to the editor: the hints, or the corrections. */
function FeedbackNotes({ text, fb }: { text: string; fb: StudentFeedback }) {
  if (fb.kind === 'hints') {
    const { placed, unplaced } = placeHints(text, fb.view.feedback.hints);
    const list = [...placed.map((p) => p.hint), ...unplaced];
    return (
      <ol className="space-y-3">
        {list.map((h, i) => (
          <li key={h.id} className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
              <NumberBadge n={i + 1} raised={false} />
              {kindsOf(h.marks)
                .map((k) => HINT_KIND_LABELS[k])
                .join(' · ')}
            </div>
            <div className="mt-1">
              <HintSentence hint={h} />
            </div>
            {h.hint && <p className="mt-1 text-gray-700">{h.hint}</p>}
          </li>
        ))}
      </ol>
    );
  }
  if (fb.kind === 'corrections') {
    const { placed } = placeRevisions(text, withRevisionIds(fb.feedback.sentence_revisions));
    return (
      <ol className="space-y-3">
        {placed.map((p, i) => (
          <li key={p.rev.id} className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
            <NumberBadge n={i + 1} raised={false} />
            <p className="mt-1 leading-7">
              <DiffOps ops={p.ops} show="after" />
            </p>
            {p.rev.explanation && <p className="mt-1 text-xs leading-relaxed text-gray-500">{p.rev.explanation}</p>}
          </li>
        ))}
      </ol>
    );
  }
  return null;
}

/** The student revises a composition after seeing the feedback, and submits the next draft (migration v17). */
export default function RevisePage() {
  const { id } = useParams();
  const router = useRouter();
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [fb, setFb] = useState<StudentFeedback | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [nextNumber, setNextNumber] = useState(2);
  const [maxDrafts, setMaxDrafts] = useState(DEFAULT_MAX_DRAFTS);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: sub } = await supabase.from('submissions').select('*').eq('id', id).single();
      setSubmission(sub);
      if (!sub) {
        setLoading(false);
        return;
      }
      setText(sub.final_text);
      const root = compositionId(sub);
      const [current, { data: rows }, { data: proj }] = await Promise.all([
        loadStudentFeedback(supabase, sub.id),
        supabase.from('submissions').select('id, draft_number').or(`id.eq.${root},first_draft_id.eq.${root}`),
        sub.project_id
          ? supabase.from('projects').select('max_drafts').eq('id', sub.project_id).single()
          : Promise.resolve({ data: null }),
      ]);
      setFb(current);
      const max = isMaxDrafts(proj?.max_drafts) ? proj.max_drafts : DEFAULT_MAX_DRAFTS;
      setMaxDrafts(max);
      const n = draftNumber(sub);
      setNextNumber(n + 1);
      const latest = Math.max(1, ...((rows ?? []) as { draft_number?: number }[]).map((r) => draftNumber({ id: '', ...r })));
      if (latest !== n) setBlocked('There is already a newer draft of this composition.');
      else if (current.kind === 'in-review') setBlocked("Your teacher hasn't released the feedback on this draft yet.");
      else if (!hasFeedback(current)) setBlocked('There is no feedback on this draft yet.');
      else if (n + 1 > max) setBlocked('This was your last draft for this assignment.');
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleSubmit = async () => {
    if (!submission || !text.trim()) return;
    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviseOf: submission.id, finalText: text }),
      });
      const data = await res.json();
      if (data.submission) {
        router.push(`/student/submissions/${data.submission.id}`);
        return;
      }
      setError(data.error || 'Submission failed');
    } catch {
      setError('Submission failed. Please try again.');
    }
    setSending(false);
  };

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (!submission) return <p className="text-red-500">Submission not found</p>;

  const unchanged = text.trim() === submission.final_text.trim();

  return (
    <div className="space-y-5">
      <Link href={`/student/submissions/${submission.id}`} className="text-sm text-gray-500 hover:text-gray-700">
        &larr; Back to the feedback
      </Link>
      <div>
        <h1 className="text-2xl font-bold">
          Revise: {submission.title || submission.assignment_name || 'Untitled'}
        </h1>
        {!blocked && (
          <p className="mt-1 text-sm text-gray-500">
            Draft {nextNumber} of {maxDrafts}. Change your composition below, then submit it to get new feedback.
          </p>
        )}
      </div>

      {blocked ? (
        <p className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-700">{blocked}</p>
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="space-y-3">
            <label htmlFor="revised-text" className="block text-sm font-medium text-gray-700">
              Your composition
            </label>
            <textarea
              id="revised-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={14}
              className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2.5 text-[17px] leading-8 outline-none focus:border-transparent focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleSubmit}
                disabled={sending || !text.trim() || unchanged}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {sending ? 'Getting feedback… (up to a minute)' : `Submit draft ${nextNumber}`}
              </button>
              <span className="text-xs text-gray-400">{text.length} characters</span>
              {unchanged && <span className="text-xs text-gray-500">You haven&apos;t changed anything yet.</span>}
            </div>
            {error && (
              <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
          </section>
          <aside className="space-y-2 lg:sticky lg:top-20">
            <h2 className="text-sm font-semibold text-gray-700">
              {fb?.kind === 'hints' ? 'What to fix' : 'The feedback'}
            </h2>
            {fb && <FeedbackNotes text={submission.final_text} fb={fb} />}
          </aside>
        </div>
      )}
    </div>
  );
}
