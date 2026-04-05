'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Class, ClassMember, Submission, Profile } from '@/types';

export default function ClassDetailPage() {
  const { id } = useParams();
  const [cls, setCls] = useState<Class | null>(null);
  const [members, setMembers] = useState<ClassMember[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: classData } = await supabase
        .from('classes')
        .select('*')
        .eq('id', id)
        .single();
      setCls(classData);

      const { data: memberData } = await supabase
        .from('class_members')
        .select('*, profiles(*)')
        .eq('class_id', id);
      setMembers(memberData || []);

      const { data: subData } = await supabase
        .from('submissions')
        .select('*, profiles(*)')
        .eq('class_id', id)
        .order('created_at', { ascending: false })
        .limit(20);
      setSubmissions(subData || []);

      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (!cls) return <p className="text-red-500">Class not found</p>;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <Link
            href="/teacher/dashboard"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            &larr; Back to classes
          </Link>
          <h1 className="text-2xl font-bold mt-1">{cls.class_name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-gray-500">Invite code:</span>
            <code className="bg-gray-100 px-2 py-0.5 rounded text-sm font-mono tracking-widest">
              {cls.invite_code}
            </code>
          </div>
        </div>
        <Link
          href={`/teacher/class/${id}/issues`}
          className="bg-orange-500 text-white px-5 py-2.5 rounded-lg text-sm hover:bg-orange-600 font-medium"
        >
          Common Issues
        </Link>
      </div>

      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold mb-3">
          Students ({members.length})
        </h2>
        {members.length === 0 ? (
          <p className="text-gray-500 text-sm">No students have joined yet</p>
        ) : (
          <div className="space-y-2">
            {members.map((m) => {
              const profile = m.profiles as unknown as Profile;
              return (
                <Link
                  key={m.id}
                  href={`/teacher/student/${m.student_id}?classId=${id}`}
                  className="flex justify-between items-center p-3 rounded-lg hover:bg-gray-50 border border-gray-100"
                >
                  <span className="text-sm font-medium">
                    {profile?.name || profile?.email || 'Unknown'}
                  </span>
                  <span className="text-xs text-blue-600">View &rarr;</span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold mb-3">Recent Submissions</h2>
        {submissions.length === 0 ? (
          <p className="text-gray-500 text-sm">No submissions yet</p>
        ) : (
          <div className="space-y-2">
            {submissions.map((sub) => {
              const profile = sub.profiles as unknown as Profile;
              return (
                <Link
                  key={sub.id}
                  href={`/teacher/student/${sub.student_id}?classId=${id}`}
                  className="block p-3 rounded-lg hover:bg-gray-50 border border-gray-100"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-sm font-medium">
                        {profile?.name || 'Unknown'}
                      </span>
                      <span className="text-gray-400 mx-2">&middot;</span>
                      <span className="text-sm text-gray-600">
                        {sub.title || sub.assignment_name || 'Untitled'}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400 whitespace-nowrap ml-4">
                      {new Date(sub.created_at).toLocaleDateString('en-US')}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-1">
                    {sub.final_text.substring(0, 80)}
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
