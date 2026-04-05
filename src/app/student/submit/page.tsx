'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import SubmissionForm from '@/components/SubmissionForm';
import { Class, Project } from '@/types';

export default function SubmitPage() {
  return (
    <Suspense fallback={<p className="text-gray-500">Loading...</p>}>
      <SubmitContent />
    </Suspense>
  );
}

function SubmitContent() {
  const searchParams = useSearchParams();
  const classIdParam = searchParams.get('classId');
  const projectIdParam = searchParams.get('projectId');

  const [cls, setCls] = useState<Class | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      if (!classIdParam) {
        setLoading(false);
        return;
      }

      const { data: membership } = await supabase
        .from('class_members')
        .select('id')
        .eq('student_id', user.id)
        .eq('class_id', classIdParam)
        .single();

      if (!membership) {
        setLoading(false);
        return;
      }
      setAuthorized(true);

      const { data: classData } = await supabase
        .from('classes')
        .select('*')
        .eq('id', classIdParam)
        .single();
      setCls(classData);

      if (projectIdParam) {
        const { data: projData } = await supabase
          .from('projects')
          .select('*')
          .eq('id', projectIdParam)
          .single();
        setProject(projData);
      }

      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classIdParam, projectIdParam]);

  if (loading) return <p className="text-gray-500">Loading...</p>;

  if (!classIdParam || !authorized) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-bold mb-2">No Class Selected</h2>
        <p className="text-gray-500 mb-4">
          Go to your class page and select a project to submit.
        </p>
        <Link
          href="/student/dashboard"
          className="text-blue-600 hover:underline text-sm"
        >
          Go to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link
        href={`/student/class/${classIdParam}`}
        className="text-sm text-gray-500 hover:text-gray-700"
      >
        &larr; Back to {cls?.class_name || 'class'}
      </Link>

      <h1 className="text-2xl font-bold mt-2 mb-2">New Submission</h1>

      {project && (
        <div className="mb-6">
          <span className="text-sm text-gray-500">
            Project: <span className="font-medium text-gray-700">{project.project_name}</span>
          </span>
          {project.description && (
            <div className="mt-2 bg-blue-50 p-4 rounded-lg border border-blue-100">
              <p className="text-xs text-blue-600 font-medium mb-1">Writing Prompt</p>
              <p className="text-sm text-gray-700">{project.description}</p>
            </div>
          )}
        </div>
      )}

      <SubmissionForm
        classId={classIdParam}
        projectId={projectIdParam || undefined}
      />
    </div>
  );
}
