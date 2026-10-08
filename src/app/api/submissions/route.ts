import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { feedbackModel, generateFeedback } from '@/lib/ai-feedback';
import { tagRevisions } from '@/lib/ai-tagging';
import type { AiTagRow } from '@/lib/ai-tagging';
import { getStudentErrorPatterns } from '@/lib/error-tracking';
import { anchorRevisions } from '@/lib/revisions';
import { prepareHintFeedback, withMarks } from '@/lib/hints';
import { joinWrappedLines } from '@/lib/text-layout';
import { DEFAULT_MAX_DRAFTS, isCorrectionLevel, isMaxDrafts } from '@/types';
import type { CorrectionLevel, FeedbackStyle } from '@/types';

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
    const { assignmentName, imagePath, ocrText, finalText, reviseOf } = body;
    let { classId, projectId, title } = body;

    // A revised draft of one of the student's compositions (migration v17): it
    // goes into the same class and assignment as the composition
    let draft: { firstDraftId: string; number: number } | null = null;
    // A composition that started as "hints only" stays that way, whatever the assignment says now
    let keepHints = false;
    if (typeof reviseOf === 'string' && reviseOf) {
      const { data: prev } = await supabase
        .from('submissions')
        .select('id, student_id, class_id, project_id, title, first_draft_id, draft_number')
        .eq('id', reviseOf)
        .single();
      if (!prev || prev.student_id !== user.id) {
        return NextResponse.json({ error: 'Composition not found' }, { status: 404 });
      }
      if (!prev.project_id) {
        return NextResponse.json({ error: 'This assignment no longer exists' }, { status: 409 });
      }
      classId = prev.class_id;
      projectId = prev.project_id;
      title = prev.title;
      const firstDraftId: string = prev.first_draft_id ?? prev.id;
      const prevNumber: number = prev.draft_number ?? 1;
      const [{ data: drafts }, inReviewRes, hintsRes, { data: proj }, { data: visible }] = await Promise.all([
        supabase.from('submissions').select('id, draft_number').or(`id.eq.${firstDraftId},first_draft_id.eq.${firstDraftId}`),
        supabase.rpc('my_submissions_in_review'),
        supabase.rpc('my_hint_submissions'),
        supabase.from('projects').select('max_drafts').eq('id', prev.project_id).single(),
        // "corrections" feedback the student can read (released)
        supabase.from('feedback').select('id').eq('submission_id', prev.id).maybeSingle(),
      ]);
      const chain = ((drafts ?? []) as { id: string; draft_number: number | null }[]);
      const latest = Math.max(1, ...chain.map((d) => d.draft_number ?? 1));
      if (latest !== prevNumber) {
        return NextResponse.json({ error: 'There is already a newer draft of this composition' }, { status: 409 });
      }
      // Revising needs feedback the student has seen (checked, or refused if it can't be checked)
      if (inReviewRes.error || hintsRes.error || !Array.isArray(inReviewRes.data) || !Array.isArray(hintsRes.data)) {
        return NextResponse.json({ error: "Couldn't check the feedback. Please try again." }, { status: 503 });
      }
      const inReview = inReviewRes.data as string[];
      const hintSubs = hintsRes.data as string[];
      if (inReview.includes(prev.id)) {
        return NextResponse.json(
          { error: "Your teacher hasn't released the feedback on this draft yet" },
          { status: 409 }
        );
      }
      if (!visible && !hintSubs.includes(prev.id)) {
        return NextResponse.json({ error: 'There is no feedback on this draft yet' }, { status: 409 });
      }
      keepHints = chain.some((d) => hintSubs.includes(d.id));
      const maxDrafts = isMaxDrafts(proj?.max_drafts) ? proj.max_drafts : DEFAULT_MAX_DRAFTS;
      if (prevNumber + 1 > maxDrafts) {
        return NextResponse.json({ error: 'This was your last draft for this assignment' }, { status: 409 });
      }
      draft = { firstDraftId, number: prevNumber + 1 };
    }

    if (!finalText || !classId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    // Every composition belongs to an assignment (so its settings, e.g. "hints only", always apply)
    if (!projectId) {
      return NextResponse.json({ error: 'Choose an assignment first' }, { status: 400 });
    }

    // A photo must be in the student's own storage folder (also enforced by RLS, migration v10)
    const safeImagePath =
      typeof imagePath === 'string' && imagePath.startsWith(`${user.id}/`) && !imagePath.includes('..')
        ? imagePath
        : null;

    // Only into a class the student has joined (or the class teacher trying it out)
    const [{ data: membership }, { data: cls }] = await Promise.all([
      supabase.from('class_members').select('id').eq('class_id', classId).eq('student_id', user.id).limit(1),
      supabase.from('classes').select('teacher_id').eq('id', classId).limit(1),
    ]);
    const isMember = Array.isArray(membership) && membership.length > 0;
    const isTeacher = Array.isArray(cls) && cls[0]?.teacher_id === user.id;
    if (!isMember && !isTeacher) {
      return NextResponse.json({ error: 'You are not in this class' }, { status: 403 });
    }

    // If projectId provided, look up project name for assignment_name and the teacher's settings
    let resolvedAssignment = assignmentName || null;
    let correctionLevel: CorrectionLevel = 'standard';
    // The teacher checks the feedback before the student sees it (migration v14)
    let holdForReview = false;
    // "Hints only": the student never sees the corrected sentences (migration v16)
    let feedbackStyle: FeedbackStyle = 'corrections';
    if (projectId) {
      const { data: project } = await supabase
        .from('projects')
        .select('class_id, project_name, correction_level, feedback_release, feedback_style')
        .eq('id', projectId)
        .single();
      // The project's settings (e.g. "hints only") can't be dodged by naming another class's project
      if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      if (project.class_id !== classId) {
        return NextResponse.json({ error: 'This project belongs to another class' }, { status: 400 });
      }
      resolvedAssignment = project.project_name;
      if (isCorrectionLevel(project.correction_level)) correctionLevel = project.correction_level;
      holdForReview = project.feedback_release === 'after_review';
      if (project.feedback_style === 'hints' || keepHints) feedbackStyle = 'hints';
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
        ...(draft ? { first_draft_id: draft.firstDraftId, draft_number: draft.number } : {}),
      })
      .select()
      .single();

    if (subError) {
      // Two revisions sent at once: the database keeps one draft per number
      if (draft && subError.code === '23505') {
        return NextResponse.json({ error: 'There is already a newer draft of this composition' }, { status: 409 });
      }
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
        correctionLevel,
        { style: feedbackStyle }
      );
    } catch (aiError) {
      console.error('AI feedback error:', aiError);
      return NextResponse.json({
        submission,
        feedback: null,
        warning: 'AI feedback generation failed. Composition saved.',
      });
    }

    const anchored = anchorRevisions(finalText, feedbackData.sentence_revisions);
    const comments = {
      overall_comment: feedbackData.overall_comment || '',
      characters_comment: feedbackData.characters_comment || '',
      vocabulary_comment: feedbackData.vocabulary_comment || '',
      grammar_comment: feedbackData.grammar_comment || '',
      content_feedback: feedbackData.content_feedback || '',
      structure_feedback: feedbackData.structure_feedback || '',
    };
    // "Hints only": hints and comments that don't give the answer away; marks show where the problems are
    const prepared =
      feedbackStyle === 'hints'
        ? prepareHintFeedback(finalText, comments, anchored)
        : { comments, revisions: withMarks(anchored) };
    const revisions = prepared.revisions;

    // The feedback as it is first shown to the student and the teacher
    const aiFeedback = {
      ...prepared.comments,
      sentence_revisions: revisions,
    };
    // Exactly what the AI wrote (before "hints only" checks), for the research copy below
    const aiRaw = { ...comments, sentence_revisions: withMarks(anchored) };

    // Feedback held for review can't be read back by the student (RLS), so it is
    // saved under an id made here and not selected after the insert.
    const feedbackId = crypto.randomUUID();
    const { error: feedbackError } = await supabase.from('feedback').insert({
      id: feedbackId,
      submission_id: submission.id,
      ...aiFeedback,
      strengths: [],
      main_problems: [],
      repeated_error_summary: '',
      next_step_advice: '',
      correction_level: correctionLevel,
      released_at: holdForReview ? null : new Date().toISOString(),
      feedback_style: feedbackStyle,
    });
    if (feedbackError) console.error('Feedback insert error:', feedbackError);
    const feedbackSaved = !feedbackError;

    // Keep a copy of it that the teacher's edits never overwrite (migration v13),
    // so we can see later what the teacher kept, changed, removed or added.
    // If it can't be saved (e.g. v13 not run yet), everything else still works.
    if (feedbackSaved) {
      const { error: originalError } = await supabase.from('feedback_ai_originals').insert({
        feedback_id: feedbackId,
        submission_id: submission.id,
        model: feedbackModel(),
        correction_level: correctionLevel,
        content: aiRaw,
      });
      if (originalError) console.error('Saving the original AI feedback failed:', originalError);
    }

    // Error labels from the fixed list, one step after the corrections (lib/ai-tagging).
    // If labelling fails the feedback is still saved; the teacher can add labels.
    if (feedbackSaved && revisions.length > 0) {
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

    return NextResponse.json({
      submission,
      feedbackId: feedbackSaved ? feedbackId : null,
      // The student sees the feedback once the teacher releases it
      inReview: feedbackSaved && holdForReview,
    });
  } catch (error) {
    console.error('Submission error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
