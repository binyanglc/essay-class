import type { SupabaseClient } from '@supabase/supabase-js';
import type { ErrorTag, Feedback } from '@/types';
import { isActive } from './error-taxonomy';
import { submissionsInReview } from './feedback-release';
import { fetchHintView } from './hints';
import type { HintView } from './hints';

/** What the signed-in student can see of the feedback on one of their compositions. */
export type StudentFeedback =
  | { kind: 'corrections'; feedback: Feedback; tags: ErrorTag[] }
  | { kind: 'hints'; view: HintView }
  | { kind: 'in-review' }
  | { kind: 'none' };

/**
 * Corrections feedback the student reads directly; "hints only" feedback
 * comes without the answers (migration v16); feedback the teacher hasn't
 * released yet shows as "in review" (v14).
 */
export async function loadStudentFeedback(supabase: SupabaseClient, submissionId: string): Promise<StudentFeedback> {
  const { data: fb } = await supabase.from('feedback').select('*').eq('submission_id', submissionId).maybeSingle();
  if (fb) {
    const { data: tags } = await supabase.from('error_tags').select('*').eq('submission_id', submissionId);
    return { kind: 'corrections', feedback: fb as Feedback, tags: ((tags ?? []) as ErrorTag[]).filter(isActive) };
  }
  const view = await fetchHintView(supabase, submissionId);
  if (view) return { kind: 'hints', view };
  if ((await submissionsInReview(supabase)).has(submissionId)) return { kind: 'in-review' };
  return { kind: 'none' };
}

/** Whether the student can see feedback (and so revise). */
export function hasFeedback(f: StudentFeedback | null | undefined): boolean {
  return f?.kind === 'corrections' || f?.kind === 'hints';
}
