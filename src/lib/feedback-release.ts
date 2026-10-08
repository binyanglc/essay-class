import type { SupabaseClient } from '@supabase/supabase-js';
import type { Feedback } from '@/types';

/**
 * The signed-in student's compositions whose feedback is waiting for the
 * teacher to release it (migration v14). The student can't read that feedback,
 * so this is how their pages tell "your teacher is checking it" apart from
 * "no feedback". Empty if it can't be checked.
 */
export async function submissionsInReview(supabase: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await supabase.rpc('my_submissions_in_review');
  if (error || !Array.isArray(data)) return new Set();
  // A set-returning function comes back as a list of values (or rows, to be safe)
  return new Set(
    data
      .map((v: unknown) =>
        typeof v === 'string' ? v : (v as Record<string, unknown> | null)?.my_submissions_in_review
      )
      .filter((v): v is string => typeof v === 'string')
  );
}

/** Saved feedback the student can't see yet. Older feedback (before v14) has no release time field at all. */
export function isWaitingForRelease(feedback: Pick<Feedback, 'released_at'> | null | undefined): boolean {
  return !!feedback && feedback.released_at === null;
}
