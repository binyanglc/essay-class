import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sanitizeRevisions } from '@/lib/revisions';
import { withMarks } from '@/lib/hints';
import { isClassTeacher } from '@/lib/class-access';

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

    if ('sentence_revisions' in updates) {
      const revisions = sanitizeRevisions(updates.sentence_revisions);
      // Where each correction changes the student's words (what "hints only" students see)
      if (revisions) safeUpdates.sentence_revisions = withMarks(revisions);
    }

    if (Object.keys(safeUpdates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    // A class can have several teachers (migration v21). The page sends the
    // teacher_edited_at it loaded: save only if no one else has saved since,
    // unless the teacher chose to replace the other teacher's version.
    const checkVersion = 'expected_edited_at' in updates && updates.overwrite !== true;
    const expected: unknown = updates.expected_edited_at;
    if (checkVersion && expected !== null && (typeof expected !== 'string' || Number.isNaN(Date.parse(expected)))) {
      return NextResponse.json({ error: 'Invalid expected_edited_at' }, { status: 400 });
    }

    safeUpdates.teacher_edited_at = new Date().toISOString();

    let query = supabase.from('feedback').update(safeUpdates).eq('id', id);
    if (checkVersion) {
      query = typeof expected === 'string' ? query.eq('teacher_edited_at', expected) : query.is('teacher_edited_at', null);
    }
    const { data, error } = await query.select();

    if (error) {
      console.error('Feedback update error:', error);
      return NextResponse.json({ error: 'Failed to update feedback' }, { status: 500 });
    }

    const saved = data?.[0];
    if (saved) return NextResponse.json(saved);

    // Nothing saved: another teacher saved first, or this user can't change it
    // (a student can read their own feedback, so check they teach the class)
    if (checkVersion) {
      const { data: current } = await supabase.from('feedback').select('*').eq('id', id).maybeSingle();
      const { data: sub } = current
        ? await supabase.from('submissions').select('class_id').eq('id', current.submission_id).maybeSingle()
        : { data: null };
      const teaches = !!sub && (await isClassTeacher(supabase, sub.class_id, user.id));
      if (current && teaches && savedSince(current.teacher_edited_at, expected)) {
        const editorId: string | null = current.teacher_edited_by ?? null;
        let editorName: string | null = null;
        if (editorId) {
          const { data: editor } = await supabase.from('profiles').select('name, email').eq('id', editorId).maybeSingle();
          editorName = editor?.name?.trim() || editor?.email || null;
        }
        return NextResponse.json(
          {
            error: 'conflict',
            edited_at: current.teacher_edited_at,
            edited_by: editorId ? { id: editorId, name: editorName, is_me: editorId === user.id } : null,
          },
          { status: 409 }
        );
      }
    }
    return NextResponse.json({ error: 'Not allowed to change this feedback' }, { status: 403 });
  } catch (error) {
    console.error('Feedback PUT error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/** The feedback was saved after the version the teacher had open. */
function savedSince(current: string | null | undefined, expected: unknown): boolean {
  if (!current) return false;
  if (typeof expected !== 'string') return true;
  return Date.parse(current) !== Date.parse(expected);
}
