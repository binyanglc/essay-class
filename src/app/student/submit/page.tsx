'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import SubmissionForm from '@/components/SubmissionForm';
import { Class, Project } from '@/types';

export default function SubmitPage() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function loadClasses() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: memberships } = await supabase
        .from('class_members')
        .select('class_id, classes(*)')
        .eq('student_id', user.id);

      if (memberships) {
        const cls = memberships
          .map((m) => m.classes as unknown as Class)
          .filter(Boolean);
        setClasses(cls);
        if (cls.length === 1) {
          setSelectedClass(cls[0].id);
        }
      }
      setLoading(false);
    }
    loadClasses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedClass) {
      setProjects([]);
      setSelectedProject('');
      return;
    }
    async function loadProjects() {
      const res = await fetch(`/api/projects?classId=${selectedClass}`);
      const data = await res.json();
      setProjects(data || []);
      setSelectedProject('');
    }
    loadProjects();
  }, [selectedClass]);

  if (loading) {
    return <p className="text-gray-500">Loading...</p>;
  }

  if (classes.length === 0) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-bold mb-2">No Class Joined</h2>
        <p className="text-gray-500 mb-4">
          Join a class first using the invite code from your teacher.
        </p>
        <a
          href="/student/dashboard"
          className="text-blue-600 hover:underline text-sm"
        >
          Go to Dashboard
        </a>
      </div>
    );
  }

  const selectedProjectData = projects.find((p) => p.id === selectedProject);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">New Submission</h1>

      {/* Class selection */}
      {classes.length > 1 && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Select Class
          </label>
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          >
            <option value="">Choose a class</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.class_name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Project selection */}
      {selectedClass && projects.length > 0 && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Project
          </label>
          <div className="space-y-2">
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedProject(p.id)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  selectedProject === p.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <span className="text-sm font-medium">{p.project_name}</span>
                {p.description && (
                  <p className="text-xs text-gray-500 mt-1">{p.description}</p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Show prompt if project selected */}
      {selectedProjectData?.description && (
        <div className="mb-6 bg-blue-50 p-4 rounded-lg border border-blue-100">
          <p className="text-xs text-blue-600 font-medium mb-1">Writing Prompt</p>
          <p className="text-sm text-gray-700">{selectedProjectData.description}</p>
        </div>
      )}

      {/* Form */}
      {selectedClass && (projects.length === 0 || selectedProject) ? (
        <SubmissionForm
          classId={selectedClass}
          projectId={selectedProject || undefined}
        />
      ) : selectedClass && projects.length > 0 && !selectedProject ? (
        <p className="text-gray-500 text-sm">Please select a project first</p>
      ) : (
        <p className="text-gray-500 text-sm">Please select a class first</p>
      )}
    </div>
  );
}
