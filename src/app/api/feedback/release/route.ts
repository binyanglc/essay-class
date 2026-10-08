import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The teacher releases feedback held for review, so the students can see it.
 * Only the class teacher can change feedback (RLS); anything already released
 * keeps its first release time.
 *
 * In feedback the teacher had opened, the AI labels they left as they were
 * become "accepted" (kept by the teacher), so students don't see them as
 * unchecked AI suggestions. Feedback released without being opened keeps its
 * AI labels marked as suggestions.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });

    const body = await request.json().catch(() => null);
    const ids: unknown = body?.feedbackIds;
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500 || !ids.every((id) => typeof id === 'string' && UUID.test(id))) {
      return NextResponse.json({ error: 'feedbackIds must be a list of feedback ids' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('feedback')
      .update({ released_at: new Date().toISOString() })
      .in('id', ids)
      .is('released_at', null)
      .select('id, submission_id, released_at, teacher_viewed_at');

    if (error) {
      console.error('Feedback release error:', error);
      return NextResponse.json({ error: 'Could not release the feedback' }, { status: 500 });
    }
    const released = (data ?? []) as { id: string; submission_id: string; released_at: string; teacher_viewed_at: string | null }[];

    // The feedback is released either way; if this fails the labels just stay marked as AI suggestions
    const opened = released.filter((f) => f.teacher_viewed_at).map((f) => f.submission_id);
    if (opened.length > 0) {
      const { error: tagError } = await supabase
        .from('error_tags')
        .update({ status: 'accepted' })
        .in('submission_id', opened)
        .eq('status', 'suggested');
      if (tagError) console.error('Keeping AI labels on release failed:', tagError);
    }

    return NextResponse.json({ released: released.map(({ id, released_at }) => ({ id, released_at })) });
  } catch (error) {
    console.error('Feedback release error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
