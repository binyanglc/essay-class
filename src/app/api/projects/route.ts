import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const classId = request.nextUrl.searchParams.get('classId');

    if (!classId) {
      return NextResponse.json({ error: 'Missing classId' }, { status: 400 });
    }

    const { data } = await supabase
      .from('projects')
      .select('*')
      .eq('class_id', classId)
      .order('created_at', { ascending: false });

    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Projects GET error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
    }

    const { classId, projectName, description, dueDate } = await request.json();

    if (!classId || !projectName?.trim()) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { data: cls } = await supabase
      .from('classes')
      .select('teacher_id')
      .eq('id', classId)
      .single();

    if (!cls || cls.teacher_id !== user.id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('projects')
      .insert({
        class_id: classId,
        project_name: projectName.trim(),
        description: description?.trim() || '',
        due_date: dueDate || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Project create error:', error);
      return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Projects POST error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
