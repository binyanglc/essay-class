import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateFeedback } from '@/lib/ai-feedback';
import { getStudentErrorHistory } from '@/lib/error-tracking';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await request.json();
    const { classId, title, assignmentName, imageUrl, ocrText, finalText } = body;

    if (!finalText || !classId) {
      return NextResponse.json({ error: '缺少必填字段' }, { status: 400 });
    }

    // Save submission
    const { data: submission, error: subError } = await supabase
      .from('submissions')
      .insert({
        student_id: user.id,
        class_id: classId,
        title: title || null,
        assignment_name: assignmentName || null,
        image_url: imageUrl || null,
        ocr_text: ocrText || null,
        final_text: finalText,
      })
      .select()
      .single();

    if (subError) {
      console.error('Submission insert error:', subError);
      return NextResponse.json({ error: '保存失败' }, { status: 500 });
    }

    // Get student error history for AI context
    const errorHistory = await getStudentErrorHistory(supabase, user.id);

    // Generate AI feedback
    let feedbackData;
    try {
      feedbackData = await generateFeedback(finalText, errorHistory);
    } catch (aiError) {
      console.error('AI feedback error:', aiError);
      // Save submission even if AI fails — feedback can be retried
      return NextResponse.json({
        submission,
        feedback: null,
        warning: 'AI反馈生成失败，作文已保存',
      });
    }

    // Save feedback
    const { data: feedback } = await supabase
      .from('feedback')
      .insert({
        submission_id: submission.id,
        overall_comment: feedbackData.overall_comment,
        strengths: feedbackData.strengths,
        main_problems: feedbackData.main_problems,
        sentence_revisions: feedbackData.sentence_revisions,
        repeated_error_summary: feedbackData.repeated_error_summary,
        next_step_advice: feedbackData.next_step_advice,
      })
      .select()
      .single();

    // Save error tags
    if (feedbackData.error_tags && feedbackData.error_tags.length > 0) {
      const errorTagRows = feedbackData.error_tags.map((tag) => ({
        submission_id: submission.id,
        student_id: user.id,
        error_type: tag.error_type,
        original_text: tag.original_text || '',
        suggested_revision: tag.suggested_revision || '',
        explanation: tag.explanation || '',
        sentence_index: tag.sentence_index ?? null,
      }));

      await supabase.from('error_tags').insert(errorTagRows);
    }

    return NextResponse.json({ submission, feedback });
  } catch (error) {
    console.error('Submission error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
