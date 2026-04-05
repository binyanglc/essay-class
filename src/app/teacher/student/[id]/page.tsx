'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Profile, Submission, Feedback, ErrorFrequency } from '@/types';
import { getStudentErrorHistory } from '@/lib/error-tracking';
import ErrorSummary from '@/components/ErrorSummary';
import FeedbackView from '@/components/FeedbackView';

export default function TeacherStudentDetailPage() {
  const { id: studentId } = useParams();
  const searchParams = useSearchParams();
  const classId = searchParams.get('classId');

  const [student, setStudent] = useState<Profile | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [selectedSub, setSelectedSub] = useState<Submission | null>(null);
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(
    null
  );
  const [errors, setErrors] = useState<ErrorFrequency[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', studentId)
        .single();
      setStudent(prof);

      let query = supabase
        .from('submissions')
        .select('*')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false });

      if (classId) {
        query = query.eq('class_id', classId);
      }

      const { data: subs } = await query;
      setSubmissions(subs || []);

      const history = await getStudentErrorHistory(
        supabase,
        studentId as string
      );
      setErrors(history);

      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const handleSelectSubmission = async (sub: Submission) => {
    setSelectedSub(sub);
    const { data: fb } = await supabase
      .from('feedback')
      .select('*')
      .eq('submission_id', sub.id)
      .single();
    setSelectedFeedback(fb);
  };

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (!student) return <p className="text-red-500">Student not found</p>;

  return (
    <div className="space-y-8">
      <div>
        {classId && (
          <Link
            href={`/teacher/class/${classId}`}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            &larr; Back to class
          </Link>
        )}
        <h1 className="text-2xl font-bold mt-1">
          {student.name || student.email}
        </h1>
      </div>

      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <ErrorSummary errors={errors} title="Student Error Summary" />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold mb-3">
            Submissions ({submissions.length})
          </h2>
          {submissions.length === 0 ? (
            <p className="text-gray-500 text-sm">No submissions yet</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {submissions.map((sub) => (
                <button
                  key={sub.id}
                  onClick={() => handleSelectSubmission(sub)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedSub?.id === sub.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-100 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">
                      {sub.title || sub.assignment_name || 'Untitled'}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(sub.created_at).toLocaleDateString('en-US')}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-1">
                    {sub.final_text.substring(0, 60)}
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-5">
          {selectedSub ? (
            <div>
              <h2 className="font-semibold mb-3">
                {selectedSub.title ||
                  selectedSub.assignment_name ||
                  'Untitled'}
              </h2>
              <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
                <p className="whitespace-pre-wrap line-clamp-6">
                  {selectedSub.final_text}
                </p>
              </div>
              {selectedFeedback ? (
                <FeedbackView feedback={selectedFeedback} />
              ) : (
                <p className="text-gray-500 text-sm">No feedback data</p>
              )}
            </div>
          ) : (
            <p className="text-gray-500 text-sm text-center py-12">
              Click a submission on the left to view details
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
