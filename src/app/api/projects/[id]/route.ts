import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });

    const { id } = await params;

    const { data: project } = await supabase
      .from('projects')
      .select('class_id')
      .eq('id', id)
      .single();
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data: cls } = await supabase
      .from('classes')
      .select('teacher_id')
      .eq('id', project.class_id)
      .single();
    if (!cls || cls.teacher_id !== user.id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};
    if ('projectName' in body) updates.project_name = body.projectName?.trim();
    if ('description' in body) updates.description = body.description?.trim() ?? '';
    if ('dueDate' in body) updates.due_date = body.dueDate || null;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('projects')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: 'Failed' }, { status: 500 });
    return NextResponse.json(data);
  } catch (error) {
    console.error('Project PUT error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });

    const { id } = await params;

    const { data: project } = await supabase
      .from('projects')
      .select('class_id')
      .eq('id', id)
      .single();
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data: cls } = await supabase
      .from('classes')
      .select('teacher_id')
      .eq('id', project.class_id)
      .single();
    if (!cls || cls.teacher_id !== user.id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id);

    if (error) return NextResponse.json({ error: 'Failed' }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Project DELETE error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
