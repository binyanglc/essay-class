'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Class, Project, Submission } from '@/types';

export default function StudentClassPage() {
  const { id: classId } = useParams();
  const [cls, setCls] = useState<Class | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: classData } = await supabase
        .from('classes')
        .select('*')
        .eq('id', classId)
        .single();
      setCls(classData);

      const res = await fetch(`/api/projects?classId=${classId}`);
      const projectData = await res.json();
      setProjects(projectData || []);

      const { data: subs } = await supabase
        .from('submissions')
        .select('*')
        .eq('student_id', user.id)
        .eq('class_id', classId)
        .order('created_at', { ascending: false });
      setSubmissions(subs || []);

      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (!cls) return <p className="text-red-500">Class not found</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/student/dashboard"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          &larr; Dashboard
        </Link>
        <h1 className="text-2xl font-bold mt-1">{cls.class_name}</h1>
      </div>

      {/* Projects */}
      <section>
        <h2 className="font-semibold mb-3">Projects</h2>
        {projects.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
            <p className="text-gray-500 text-sm">
              Your teacher hasn&apos;t created any projects yet.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {projects.map((p) => {
              const mySubs = submissions.filter((s) => s.project_id === p.id);
              return (
                <div
                  key={p.id}
                  className="bg-white rounded-xl border border-gray-200 p-5"
                >
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium">{p.project_name}</h3>
                      {p.description && (
                        <p className="text-sm text-gray-500 mt-1">
                          {p.description}
                        </p>
                      )}
                      {mySubs.length > 0 && (
                        <p className="text-xs text-gray-400 mt-2">
                          You submitted {mySubs.length} time{mySubs.length > 1 ? 's' : ''}
                        </p>
                      )}
                    </div>
                    <Link
                      href={`/student/submit?classId=${classId}&projectId=${p.id}`}
                      className="bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm hover:bg-blue-700 font-medium whitespace-nowrap text-center"
                    >
                      Submit
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* My Submissions in this class */}
      <section>
        <h2 className="font-semibold mb-3">
          My Submissions ({submissions.length})
        </h2>
        {submissions.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
            <p className="text-gray-500 text-sm">
              No submissions yet. Select a project above to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {submissions.map((sub) => (
              <Link
                key={sub.id}
                href={`/student/submissions/${sub.id}`}
                className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 transition-colors"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-sm font-medium">
                      {sub.title || sub.assignment_name || 'Untitled'}
                    </span>
                    {sub.assignment_name && sub.title && (
                      <span className="text-xs text-gray-400 ml-2">
                        {sub.assignment_name}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Date(sub.created_at).toLocaleDateString('en-US')}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1 line-clamp-1">
                  {sub.final_text.substring(0, 80)}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
