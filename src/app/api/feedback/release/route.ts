import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The teacher releases feedback held for review, so the students can see it.
 * Only the class teacher can change feedback (RLS); anything already released
 * keeps its first release time.
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
      .select('id, released_at');

    if (error) {
      console.error('Feedback release error:', error);
      return NextResponse.json({ error: 'Could not release the feedback' }, { status: 500 });
    }
    return NextResponse.json({ released: data ?? [] });
  } catch (error) {
    console.error('Feedback release error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
