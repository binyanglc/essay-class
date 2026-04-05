'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Submission, Feedback, ErrorTag } from '@/types';
import FeedbackView from '@/components/FeedbackView';

export default function SubmissionDetailPage() {
  const { id } = useParams();
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [errorTags, setErrorTags] = useState<ErrorTag[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: sub } = await supabase
        .from('submissions')
        .select('*')
        .eq('id', id)
        .single();
      setSubmission(sub);

      if (sub) {
        const { data: fb } = await supabase
          .from('feedback')
          .select('*')
          .eq('submission_id', sub.id)
          .single();
        setFeedback(fb);

        const { data: tags } = await supabase
          .from('error_tags')
          .select('*')
          .eq('submission_id', sub.id);
        setErrorTags(tags || []);
      }
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) return <p className="text-gray-500">加载中...</p>;
  if (!submission) return <p className="text-red-500">未找到该提交</p>;

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Link
          href="/student/submissions"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          &larr; 返回列表
        </Link>
      </div>

      {/* Submission info */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-xl font-bold">
              {submission.title || submission.assignment_name || '未命名作文'}
            </h1>
            {submission.assignment_name && (
              <span className="text-sm text-gray-500">
                {submission.assignment_name}
              </span>
            )}
          </div>
          <span className="text-xs text-gray-400">
            {new Date(submission.created_at).toLocaleString('zh-CN')}
          </span>
        </div>

        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-500 mb-2">作文原文</h3>
          <p className="text-gray-800 whitespace-pre-wrap leading-relaxed">
            {submission.final_text}
          </p>
        </div>
      </div>

      {/* Feedback */}
      {feedback ? (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-bold mb-4">AI反馈</h2>
          <FeedbackView feedback={feedback} errorTags={errorTags} />
        </div>
      ) : (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5">
          <p className="text-yellow-800">
            反馈尚未生成。可能AI处理时出现了问题，请联系教师。
          </p>
        </div>
      )}
    </div>
  );
}
