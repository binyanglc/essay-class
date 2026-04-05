'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Submission } from '@/types';

export default function SubmissionsPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('submissions')
        .select('*')
        .eq('student_id', user.id)
        .order('created_at', { ascending: false });

      setSubmissions(data || []);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">My Submissions</h1>
        <Link
          href="/student/submit"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
        >
          New Submission
        </Link>
      </div>

      {submissions.length === 0 ? (
        <p className="text-gray-500 text-center py-12">No submissions yet</p>
      ) : (
        <div className="space-y-3">
          {submissions.map((sub) => (
            <Link
              key={sub.id}
              href={`/student/submissions/${sub.id}`}
              className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 transition-colors"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-medium text-gray-900">
                    {sub.title || sub.assignment_name || 'Untitled'}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                    {sub.final_text.substring(0, 100)}
                  </p>
                </div>
                <span className="text-xs text-gray-400 whitespace-nowrap ml-4">
                  {new Date(sub.created_at).toLocaleDateString('en-US')}
                </span>
              </div>
              {sub.assignment_name && (
                <span className="inline-block mt-2 px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                  {sub.assignment_name}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
