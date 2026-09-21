import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ERROR_TAG_TYPES } from '@/types';

const text = (v: unknown, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : '');

/** A teacher adds an error label to a submission (RLS: only that class's teacher, migration v11). */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });

    const body = await request.json();
    const { submission_id, error_type, pattern_name } = body;
    if (
      typeof submission_id !== 'string' ||
      !(ERROR_TAG_TYPES as readonly string[]).includes(error_type) ||
      typeof pattern_name !== 'string' ||
      !pattern_name.trim()
    ) {
      return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 });
    }

    // The label belongs to the student who wrote the submission
    const { data: submission } = await supabase
      .from('submissions')
      .select('student_id, class_id')
      .eq('id', submission_id)
      .single();
    if (!submission) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Only the class teacher adds labels here (the AI's labels are saved with the submission)
    const { data: cls } = await supabase.from('classes').select('teacher_id').eq('id', submission.class_id).single();
    if (cls?.teacher_id !== user.id) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

    const { data, error } = await supabase
      .from('error_tags')
      .insert({
        submission_id,
        student_id: submission.student_id,
        error_type,
        pattern_name: pattern_name.trim().slice(0, 80),
        original_text: text(body.original_text),
        suggested_revision: text(body.suggested_revision),
        explanation: text(body.explanation),
        improvement_tip: '',
        sentence_index: null,
      })
      .select()
      .single();

    if (error) {
      console.error('ErrorTag POST error:', error);
      return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error('ErrorTag POST error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
