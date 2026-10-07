import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { feedbackModel, generateFeedback } from '@/lib/ai-feedback';
import { tagRevisions } from '@/lib/ai-tagging';
import type { AiTagRow } from '@/lib/ai-tagging';
import { getStudentErrorPatterns } from '@/lib/error-tracking';
import { anchorRevisions } from '@/lib/revisions';
import { joinWrappedLines } from '@/lib/text-layout';
import { isCorrectionLevel } from '@/types';
import type { CorrectionLevel } from '@/types';

// Feedback and labelling are two AI calls in a row
export const maxDuration = 60;

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
    const { classId, projectId, title, assignmentName, imagePath, ocrText, finalText } = body;

    if (!finalText || !classId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // A photo must be in the student's own storage folder (also enforced by RLS, migration v10)
    const safeImagePath =
      typeof imagePath === 'string' && imagePath.startsWith(`${user.id}/`) && !imagePath.includes('..')
        ? imagePath
        : null;

    // If projectId provided, look up project name for assignment_name and the teacher's correction level
    let resolvedAssignment = assignmentName || null;
    let correctionLevel: CorrectionLevel = 'standard';
    if (projectId) {
      const { data: project } = await supabase
        .from('projects')
        .select('project_name, correction_level')
        .eq('id', projectId)
        .single();
      if (project) {
        resolvedAssignment = project.project_name;
        if (isCorrectionLevel(project.correction_level)) correctionLevel = project.correction_level;
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
        image_url: null,
        image_path: safeImagePath,
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
      // The AI sees mid-sentence line breaks joined; revisions are still anchored to finalText
      feedbackData = await generateFeedback(
        joinWrappedLines(finalText),
        errorPatterns,
        previousCount ?? 0,
        correctionLevel
      );
    } catch (aiError) {
      console.error('AI feedback error:', aiError);
      return NextResponse.json({
        submission,
        feedback: null,
        warning: 'AI feedback generation failed. Composition saved.',
      });
    }

    const revisions = anchorRevisions(finalText, feedbackData.sentence_revisions);

    // The AI's feedback as it is first shown to the student and the teacher
    const aiFeedback = {
      overall_comment: feedbackData.overall_comment || '',
      characters_comment: feedbackData.characters_comment || '',
      vocabulary_comment: feedbackData.vocabulary_comment || '',
      grammar_comment: feedbackData.grammar_comment || '',
      content_feedback: feedbackData.content_feedback || '',
      structure_feedback: feedbackData.structure_feedback || '',
      sentence_revisions: revisions,
    };

    const { data: feedback } = await supabase
      .from('feedback')
      .insert({
        submission_id: submission.id,
        ...aiFeedback,
        strengths: [],
        main_problems: [],
        repeated_error_summary: '',
        next_step_advice: '',
        correction_level: correctionLevel,
      })
      .select()
      .single();

    // Keep a copy of it that the teacher's edits never overwrite (migration v13),
    // so we can see later what the teacher kept, changed, removed or added.
    // If it can't be saved (e.g. v13 not run yet), everything else still works.
    if (feedback) {
      const { error: originalError } = await supabase.from('feedback_ai_originals').insert({
        feedback_id: feedback.id,
        submission_id: submission.id,
        model: feedbackModel(),
        correction_level: correctionLevel,
        content: aiFeedback,
      });
      if (originalError) console.error('Saving the original AI feedback failed:', originalError);
    }

    // Error labels from the fixed list, one step after the corrections (lib/ai-tagging).
    // If labelling fails the feedback is still saved; the teacher can add labels.
    if (feedback && revisions.length > 0) {
      let labels: AiTagRow[] = [];
      try {
        labels = await tagRevisions(
          revisions.map((r) => ({ id: r.id!, original: r.original, revised: r.revised, explanation: r.explanation })),
          correctionLevel
        );
      } catch (tagError) {
        console.error('AI labelling error:', tagError);
      }
      if (labels.length > 0) {
        const { error: tagInsertError } = await supabase
          .from('error_tags')
          .insert(labels.map((l) => ({ ...l, submission_id: submission.id, student_id: user.id })));
        if (tagInsertError) console.error('Error label insert error:', tagInsertError);
      }
    }

    return NextResponse.json({ submission, feedback });
  } catch (error) {
    console.error('Submission error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
