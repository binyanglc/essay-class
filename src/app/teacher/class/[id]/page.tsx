'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Class, ClassMember, Project, Profile } from '@/types';

export default function ClassDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [cls, setCls] = useState<Class | null>(null);
  const [members, setMembers] = useState<ClassMember[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectCounts, setProjectCounts] = useState<Record<string, number>>({});

  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [editingClassName, setEditingClassName] = useState(false);
  const [classNameDraft, setClassNameDraft] = useState('');
  const [renamingStudent, setRenamingStudent] = useState<string | null>(null);
  const [studentNameDraft, setStudentNameDraft] = useState('');

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
      .select('*, profiles!student_id(*)')
      .eq('class_id', id);
    const studentMembers = (memberData || []).filter((m) => {
      const p = m.profiles as unknown as Profile;
      return p?.role === 'student';
    });
    setMembers(studentMembers);

    const res = await fetch(`/api/projects?classId=${id}`);
    const projectData = await res.json();
    setProjects(projectData || []);

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
        dueDate: newDueDate || null,
      }),
    });
    if (res.ok) {
      setNewName('');
      setNewDesc('');
      setNewDueDate('');
      setShowForm(false);
      loadAll();
    }
    setCreating(false);
  };

  const classAction = async (action: string, extra?: Record<string, unknown>) => {
    const res = await fetch(`/api/classes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...extra }),
    });
    return res;
  };

  const handleRenameClass = async () => {
    if (!classNameDraft.trim()) return;
    const res = await classAction('rename', { className: classNameDraft });
    if (res.ok) {
      const data = await res.json();
      setCls(data);
      setEditingClassName(false);
    }
  };

  const handleRegenerateCode = async () => {
    if (!confirm('Generate a new invite code? The old code will stop working.')) return;
    const res = await classAction('regenerate_code');
    if (res.ok) {
      const data = await res.json();
      setCls(data);
    }
  };

  const handleDeleteClass = async () => {
    if (!confirm('Delete this class? This will permanently remove all projects, submissions, and feedback. This cannot be undone.')) return;
    const res = await fetch(`/api/classes/${id}`, { method: 'DELETE' });
    if (res.ok) {
      router.push('/teacher/dashboard');
    }
  };

  const handleRemoveStudent = async (studentId: string, name: string) => {
    if (!confirm(`Remove "${name}" from this class?`)) return;
    const res = await classAction('remove_student', { studentId });
    if (res.ok) loadAll();
  };

  const handleRenameStudent = async (studentId: string) => {
    if (!studentNameDraft.trim()) return;
    const res = await classAction('rename_student', { studentId, name: studentNameDraft });
    if (res.ok) {
      setRenamingStudent(null);
      setStudentNameDraft('');
      loadAll();
    }
  };

  const handleDeleteProject = async (projectId: string, projectName: string) => {
    if (!confirm(`Delete project "${projectName}"? All submissions under this project will also be deleted.`)) return;
    const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
    if (res.ok) loadAll();
  };

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (!cls) return <p className="text-red-500">Class not found</p>;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <Link
          href="/teacher/dashboard"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          &larr; Back to classes
        </Link>

        <div className="flex items-center gap-3 mt-1">
          {editingClassName ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={classNameDraft}
                onChange={(e) => setClassNameDraft(e.target.value)}
                className="text-2xl font-bold border-b-2 border-blue-500 outline-none bg-transparent"
                onKeyDown={(e) => e.key === 'Enter' && handleRenameClass()}
                autoFocus
              />
              <button onClick={handleRenameClass} className="text-sm text-blue-600 hover:underline">Save</button>
              <button onClick={() => setEditingClassName(false)} className="text-sm text-gray-400 hover:underline">Cancel</button>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold">{cls.class_name}</h1>
              <button
                onClick={() => { setEditingClassName(true); setClassNameDraft(cls.class_name); }}
                className="text-xs text-gray-400 hover:text-blue-600"
                title="Rename class"
              >
                ✏️
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 mt-1">
          <span className="text-sm text-gray-500">Invite code:</span>
          <code className="bg-gray-100 px-2 py-0.5 rounded text-sm font-mono tracking-widest">
            {cls.invite_code}
          </code>
          <button
            onClick={handleRegenerateCode}
            className="text-xs text-gray-400 hover:text-blue-600"
            title="Generate new code"
          >
            ↻
          </button>
        </div>

        <div className="mt-3">
          <button
            onClick={handleDeleteClass}
            className="text-xs text-red-400 hover:text-red-600"
          >
            Delete this class
          </button>
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
            <div>
              <label className="block text-xs text-gray-500 mb-1">Due date (optional)</label>
              <input
                type="datetime-local"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCreateProject}
                disabled={creating || !newName.trim()}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
              <button
                onClick={() => { setShowForm(false); setNewName(''); setNewDesc(''); setNewDueDate(''); }}
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
              <div
                key={p.id}
                className="p-4 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors"
              >
                <div className="flex justify-between items-start">
                  <Link href={`/teacher/class/${id}/project/${p.id}`} className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm">{p.project_name}</h3>
                    {p.description && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-1">
                        {p.description}
                      </p>
                    )}
                  </Link>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                    {p.due_date && (
                      <span className={`text-xs ${new Date(p.due_date) < new Date() ? 'text-red-500' : 'text-gray-400'}`}>
                        Due: {new Date(p.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      {projectCounts[p.id] || 0} submissions
                    </span>
                    <Link href={`/teacher/class/${id}/project/${p.id}`} className="text-xs text-blue-600">
                      View &rarr;
                    </Link>
                    <button
                      onClick={() => handleDeleteProject(p.id, p.project_name)}
                      className="text-xs text-red-400 hover:text-red-600"
                      title="Delete project"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
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
            {members.map((m, idx) => {
              const profile = m.profiles as unknown as Profile;
              const displayName = (profile?.name && profile.name !== 'Guest' && profile.name.trim())
                ? profile.name
                : profile?.email
                  ? profile.email
                  : `Guest Student ${idx + 1}`;
              const isRenaming = renamingStudent === m.student_id;

              return (
                <div
                  key={m.id}
                  className="flex justify-between items-center p-3 rounded-lg border border-gray-100"
                >
                  <div className="flex-1 min-w-0">
                    {isRenaming ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={studentNameDraft}
                          onChange={(e) => setStudentNameDraft(e.target.value)}
                          className="border border-blue-300 rounded px-2 py-1 text-sm w-40 focus:ring-2 focus:ring-blue-500 outline-none"
                          placeholder="Student name"
                          onKeyDown={(e) => e.key === 'Enter' && handleRenameStudent(m.student_id)}
                          autoFocus
                        />
                        <button onClick={() => handleRenameStudent(m.student_id)} className="text-xs text-blue-600 hover:underline">Save</button>
                        <button onClick={() => setRenamingStudent(null)} className="text-xs text-gray-400 hover:underline">Cancel</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/teacher/student/${m.student_id}?classId=${id}`}
                          className="text-sm font-medium hover:text-blue-600"
                        >
                          {displayName}
                        </Link>
                        <button
                          onClick={() => { setRenamingStudent(m.student_id); setStudentNameDraft(profile?.name || ''); }}
                          className="text-xs text-gray-300 hover:text-blue-600"
                          title="Rename student"
                        >
                          ✏️
                        </button>
                        <span className="text-xs text-gray-400">
                          joined {new Date(m.joined_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/teacher/student/${m.student_id}?classId=${id}`}
                      className="text-xs text-blue-600"
                    >
                      View &rarr;
                    </Link>
                    <button
                      onClick={() => handleRemoveStudent(m.student_id, displayName)}
                      className="text-xs text-red-400 hover:text-red-600"
                      title="Remove from class"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
