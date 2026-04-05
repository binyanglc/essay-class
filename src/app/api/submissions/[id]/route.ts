import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });

    const { id } = await params;

    const { data: sub } = await supabase
      .from('submissions')
      .select('class_id')
      .eq('id', id)
      .single();
    if (!sub) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data: cls } = await supabase
      .from('classes')
      .select('teacher_id')
      .eq('id', sub.class_id)
      .single();
    if (!cls || cls.teacher_id !== user.id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const { error } = await supabase
      .from('submissions')
      .delete()
      .eq('id', id);

    if (error) return NextResponse.json({ error: 'Failed' }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Submission DELETE error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
