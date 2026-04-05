import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateFeedback } from '@/lib/ai-feedback';
import { getStudentErrorPatterns } from '@/lib/error-tracking';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
    }

    const body = await request.json();
    const { classId, projectId, title, assignmentName, imageUrl, ocrText, finalText } = body;

    if (!finalText || !classId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // If projectId provided, look up project name for assignment_name
    let resolvedAssignment = assignmentName || null;
    if (projectId) {
      const { data: project } = await supabase
        .from('projects')
        .select('project_name')
        .eq('id', projectId)
        .single();
      if (project) {
        resolvedAssignment = project.project_name;
      }
    }

    const { data: submission, error: subError } = await supabase
      .from('submissions')
      .insert({
        student_id: user.id,
        class_id: classId,
        project_id: projectId || null,
        title: title || null,
        assignment_name: resolvedAssignment,
        image_url: imageUrl || null,
        ocr_text: ocrText || null,
        final_text: finalText,
      })
      .select()
      .single();

    if (subError) {
      console.error('Submission insert error:', subError);
      return NextResponse.json({ error: 'Save failed' }, { status: 500 });
    }

    const { count: previousCount } = await supabase
      .from('submissions')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', user.id)
      .neq('id', submission.id);

    const errorPatterns = await getStudentErrorPatterns(supabase, user.id);

    let feedbackData;
    try {
      feedbackData = await generateFeedback(
        finalText,
        errorPatterns,
        previousCount ?? 0
      );
    } catch (aiError) {
      console.error('AI feedback error:', aiError);
      return NextResponse.json({
        submission,
        feedback: null,
        warning: 'AI feedback generation failed. Composition saved.',
      });
    }

    const { data: feedback } = await supabase
      .from('feedback')
      .insert({
        submission_id: submission.id,
        overall_comment: feedbackData.overall_comment || '',
        strengths: [],
        main_problems: [],
        characters_comment: feedbackData.characters_comment || '',
        vocabulary_comment: feedbackData.vocabulary_comment || '',
        grammar_comment: feedbackData.grammar_comment || '',
        content_feedback: feedbackData.content_feedback || '',
        structure_feedback: feedbackData.structure_feedback || '',
        sentence_revisions: feedbackData.sentence_revisions || [],
        repeated_error_summary: '',
        next_step_advice: '',
      })
      .select()
      .single();

    if (feedbackData.error_tags && feedbackData.error_tags.length > 0) {
      const validTypes = ['characters', 'vocabulary', 'grammar'];
      const errorTagRows = feedbackData.error_tags
        .filter((tag) => validTypes.includes(tag.error_type))
        .map((tag) => ({
          submission_id: submission.id,
          student_id: user.id,
          error_type: tag.error_type,
          pattern_name: tag.pattern_name || tag.error_type,
          original_text: tag.original_text || '',
          suggested_revision: tag.suggested_revision || '',
          explanation: tag.explanation || '',
          improvement_tip: tag.improvement_tip || '',
          sentence_index: tag.sentence_index ?? null,
        }));

      if (errorTagRows.length > 0) {
        await supabase.from('error_tags').insert(errorTagRows);
      }
    }

    return NextResponse.json({ submission, feedback });
  } catch (error) {
    console.error('Submission error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
