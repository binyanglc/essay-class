import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function verifyTeacher(supabase: Awaited<ReturnType<typeof createClient>>, classId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: cls } = await supabase
    .from('classes')
    .select('teacher_id')
    .eq('id', classId)
    .single();

  if (!cls || cls.teacher_id !== user.id) return null;
  return user;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id } = await params;
    const teacher = await verifyTeacher(supabase, id);
    if (!teacher) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const body = await request.json();
    const { action } = body;

    if (action === 'rename') {
      const { className } = body;
      if (!className?.trim()) {
        return NextResponse.json({ error: 'Name required' }, { status: 400 });
      }
      const { data, error } = await supabase
        .from('classes')
        .update({ class_name: className.trim() })
        .eq('id', id)
        .select()
        .single();
      if (error) return NextResponse.json({ error: 'Failed' }, { status: 500 });
      return NextResponse.json(data);
    }

    if (action === 'regenerate_code') {
      const newCode = generateInviteCode();
      const { data, error } = await supabase
        .from('classes')
        .update({ invite_code: newCode })
        .eq('id', id)
        .select()
        .single();
      if (error) return NextResponse.json({ error: 'Failed' }, { status: 500 });
      return NextResponse.json(data);
    }

    if (action === 'remove_student') {
      const { studentId } = body;
      if (!studentId) return NextResponse.json({ error: 'Missing studentId' }, { status: 400 });
      const { error } = await supabase
        .from('class_members')
        .delete()
        .eq('class_id', id)
        .eq('student_id', studentId);
      if (error) return NextResponse.json({ error: 'Failed' }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    if (action === 'rename_student') {
      const { studentId, name } = body;
      if (!studentId || !name?.trim()) {
        return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
      }
      const { error } = await supabase
        .from('profiles')
        .update({ name: name.trim() })
        .eq('id', studentId);
      if (error) return NextResponse.json({ error: 'Failed' }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Class PUT error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id } = await params;
    const teacher = await verifyTeacher(supabase, id);
    if (!teacher) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const { error } = await supabase
      .from('classes')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Delete class error:', error);
      return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Class DELETE error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
