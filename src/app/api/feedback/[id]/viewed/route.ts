import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * The class teacher opened this feedback. Only the first time is kept. Used for
 * "Release reviewed" (opening counts as reviewing), and so the AI labels count as kept when the teacher then
 * releases it. Only the class teacher can change feedback (RLS), so for anyone
 * else this changes nothing.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });

    const { id } = await params;
    const { data, error } = await supabase
      .from('feedback')
      .update({ teacher_viewed_at: new Date().toISOString() })
      .eq('id', id)
      .is('teacher_viewed_at', null)
      .select('id, teacher_viewed_at');

    if (error) {
      console.error('Feedback viewed error:', error);
      return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
    return NextResponse.json({ viewed: data ?? [] });
  } catch (error) {
    console.error('Feedback viewed error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
