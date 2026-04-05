'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Class, ClassMember, Project, Profile } from '@/types';

export default function ClassDetailPage() {
  const { id } = useParams();
  const [cls, setCls] = useState<Class | null>(null);
  const [members, setMembers] = useState<ClassMember[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectCounts, setProjectCounts] = useState<Record<string, number>>({});
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function loadAll() {
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

    const res = await fetch(`/api/projects?classId=${id}`);
    const projectData = await res.json();
    setProjects(projectData || []);

    // Get submission counts per project
    if (projectData && projectData.length > 0) {
      const counts: Record<string, number> = {};
      for (const p of projectData) {
        const { count } = await supabase
          .from('submissions')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', p.id);
        counts[p.id] = count || 0;
      }
      setProjectCounts(counts);
    }

    setLoading(false);
  }

  const handleCreateProject = async () => {
    if (!newName.trim()) return;
    setCreating(true);

    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        classId: id,
        projectName: newName,
        description: newDesc,
      }),
    });

    if (res.ok) {
      setNewName('');
      setNewDesc('');
      setShowForm(false);
      loadAll();
    }
    setCreating(false);
  };

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (!cls) return <p className="text-red-500">Class not found</p>;

  return (
    <div className="space-y-8">
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

      {/* Projects */}
      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold">Projects ({projects.length})</h2>
          <button
            onClick={() => setShowForm(!showForm)}
            className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            + New Project
          </button>
        </div>

        {showForm && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Project name, e.g. Lesson 28 Writing"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
            <textarea
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Description / writing prompt (optional)"
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-y"
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreateProject}
                disabled={creating || !newName.trim()}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
              <button
                onClick={() => { setShowForm(false); setNewName(''); setNewDesc(''); }}
                className="text-sm text-gray-500 px-4 py-2"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {projects.length === 0 ? (
          <p className="text-gray-500 text-sm">
            No projects yet. Create one for students to submit their writing.
          </p>
        ) : (
          <div className="space-y-2">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/teacher/class/${id}/project/${p.id}`}
                className="block p-4 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-medium text-sm">{p.project_name}</h3>
                    {p.description && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-1">
                        {p.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">
                      {projectCounts[p.id] || 0} submissions
                    </span>
                    <span className="text-xs text-blue-600">View &rarr;</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Students */}
      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold mb-3">Students ({members.length})</h2>
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
    </div>
  );
}
