import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
    }

    const { id } = await params;
    const updates = await request.json();

    const textFields = [
      'overall_comment',
      'characters_comment',
      'vocabulary_comment',
      'grammar_comment',
      'content_feedback',
      'structure_feedback',
    ];

    const safeUpdates: Record<string, unknown> = {};
    for (const key of textFields) {
      if (key in updates) {
        safeUpdates[key] = updates[key];
      }
    }

    if ('sentence_revisions' in updates && Array.isArray(updates.sentence_revisions)) {
      safeUpdates.sentence_revisions = updates.sentence_revisions;
    }

    if (Object.keys(safeUpdates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    safeUpdates.teacher_edited_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('feedback')
      .update(safeUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Feedback update error:', error);
      return NextResponse.json({ error: 'Failed to update feedback' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Feedback PUT error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
