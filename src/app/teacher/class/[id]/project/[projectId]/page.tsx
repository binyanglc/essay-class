'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Project, Submission, Feedback, ErrorTag, Profile, ErrorType } from '@/types';
import ClassIssues from '@/components/ClassIssues';

interface ClassError {
  error_type: ErrorType;
  count: number;
  examples: { id: string; original: string; revision: string; explanation: string }[];
}

interface SentenceRevision {
  original: string;
  revised: string;
  explanation: string;
}

export default function ProjectDetailPage() {
  const { id: classId, projectId } = useParams();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [selectedSub, setSelectedSub] = useState<Submission | null>(null);
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null);
  const [selectedTags, setSelectedTags] = useState<ErrorTag[]>([]);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [editingRevisions, setEditingRevisions] = useState<SentenceRevision[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [issues, setIssues] = useState<ClassError[]>([]);
  const [issueCount, setIssueCount] = useState(0);
  const [showIssues, setShowIssues] = useState(false);
  const [editingProject, setEditingProject] = useState(false);
  const [projNameDraft, setProjNameDraft] = useState('');
  const [projDescDraft, setProjDescDraft] = useState('');
  const [projDueDraft, setProjDueDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function loadData() {
    const { data: proj } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();
    setProject(proj);

    const { data: subs } = await supabase
      .from('submissions')
      .select('*, profiles(*)')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    setSubmissions(subs || []);

    const res = await fetch(
      `/api/teacher/issues?classId=${classId}&projectId=${projectId}`
    );
    const issueData = await res.json();
    setIssues(issueData.errorTypes || []);
    setIssueCount(issueData.totalSubmissions || 0);

    setLoading(false);
  }

  const handleSelectSubmission = async (sub: Submission) => {
    setSelectedSub(sub);
    setEditing({});
    setEditingRevisions(null);

    const { data: fb } = await supabase
      .from('feedback')
      .select('*')
      .eq('submission_id', sub.id)
      .single();
    setSelectedFeedback(fb);

    const { data: tags } = await supabase
      .from('error_tags')
      .select('*')
      .eq('submission_id', sub.id);
    setSelectedTags(tags || []);
  };

  const handleEditField = (field: string, value: string) => {
    setEditing((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveEdits = async () => {
    if (!selectedFeedback) return;
    const hasTextEdits = Object.keys(editing).length > 0;
    const hasRevisionEdits = editingRevisions !== null;
    if (!hasTextEdits && !hasRevisionEdits) return;

    setSaving(true);

    const body: Record<string, unknown> = { ...editing };
    if (hasRevisionEdits) {
      body.sentence_revisions = editingRevisions;
    }

    const res = await fetch(`/api/feedback/${selectedFeedback.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const updated = await res.json();
      setSelectedFeedback(updated);
      setEditing({});
      setEditingRevisions(null);
    }
    setSaving(false);
  };

  const handleEditProject = async () => {
    if (!projNameDraft.trim()) return;
    const res = await fetch(`/api/projects/${projectId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectName: projNameDraft,
        description: projDescDraft,
        dueDate: projDueDraft || null,
      }),
    });
    if (res.ok) {
      const updated = await res.json();
      setProject(updated);
      setEditingProject(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!confirm('Delete this project? All submissions and feedback will be permanently removed.')) return;
    const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
    if (res.ok) router.push(`/teacher/class/${classId}`);
  };

  const handleDeleteSubmission = async (subId: string) => {
    if (!confirm('Delete this submission and its feedback?')) return;
    const res = await fetch(`/api/submissions/${subId}`, { method: 'DELETE' });
    if (res.ok) {
      if (selectedSub?.id === subId) {
        setSelectedSub(null);
        setSelectedFeedback(null);
        setSelectedTags([]);
      }
      loadData();
    }
  };

  const hasEdits = Object.keys(editing).length > 0 || editingRevisions !== null;

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (!project) return <p className="text-red-500">Project not found</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/teacher/class/${classId}`}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          &larr; Back to class
        </Link>

        {editingProject ? (
          <div className="mt-2 p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
            <input
              type="text"
              value={projNameDraft}
              onChange={(e) => setProjNameDraft(e.target.value)}
              placeholder="Project name"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              autoFocus
            />
            <textarea
              value={projDescDraft}
              onChange={(e) => setProjDescDraft(e.target.value)}
              placeholder="Description / writing prompt"
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-y"
            />
            <div>
              <label className="block text-xs text-gray-500 mb-1">Due date</label>
              <input
                type="datetime-local"
                value={projDueDraft}
                onChange={(e) => setProjDueDraft(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleEditProject}
                disabled={!projNameDraft.trim()}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                Save
              </button>
              <button
                onClick={() => setEditingProject(false)}
                className="text-sm text-gray-500 px-4 py-2"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mt-1">
              <h1 className="text-2xl font-bold">{project.project_name}</h1>
              <button
                onClick={() => {
                  setEditingProject(true);
                  setProjNameDraft(project.project_name);
                  setProjDescDraft(project.description || '');
                  setProjDueDraft(project.due_date ? new Date(project.due_date).toISOString().slice(0, 16) : '');
                }}
                className="text-xs text-gray-400 hover:text-blue-600"
                title="Edit project"
              >
                ✏️
              </button>
            </div>
            {project.description && (
              <p className="text-sm text-gray-500 mt-1">{project.description}</p>
            )}
            {project.due_date && (
              <p className={`text-xs mt-1 ${new Date(project.due_date) < new Date() ? 'text-red-500' : 'text-gray-400'}`}>
                Due: {new Date(project.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </p>
            )}
            <button
              onClick={handleDeleteProject}
              className="text-xs text-red-400 hover:text-red-600 mt-2"
            >
              Delete this project
            </button>
          </>
        )}
      </div>

      <div>
        <button
          onClick={() => setShowIssues(!showIssues)}
          className="bg-orange-500 text-white px-5 py-2.5 rounded-lg text-sm hover:bg-orange-600 font-medium"
        >
          {showIssues ? 'Hide' : 'Show'} Common Issues ({issueCount} submissions)
        </button>
      </div>

      {showIssues && (
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <ClassIssues errors={issues} totalSubmissions={issueCount} onRefresh={loadData} />
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold mb-3">
            Submissions ({submissions.length})
          </h2>
          {submissions.length === 0 ? (
            <p className="text-gray-500 text-sm">No submissions yet</p>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {submissions.map((sub) => {
                const profile = sub.profiles as unknown as Profile;
                return (
                  <div
                    key={sub.id}
                    className={`p-3 rounded-lg border transition-colors ${
                      selectedSub?.id === sub.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-100 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <button
                        onClick={() => handleSelectSubmission(sub)}
                        className="flex-1 text-left min-w-0"
                      >
                        <div className="flex justify-between">
                          <span className="text-sm font-medium">
                            {profile?.name || 'Unknown'}
                          </span>
                          <span className="text-xs text-gray-400">
                            {new Date(sub.created_at).toLocaleDateString('en-US')}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1 line-clamp-1">
                          {sub.final_text.substring(0, 60)}
                        </p>
                      </button>
                      <button
                        onClick={() => handleDeleteSubmission(sub.id)}
                        className="text-xs text-red-300 hover:text-red-600 ml-2 flex-shrink-0 mt-0.5"
                        title="Delete submission"
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

        <section className="bg-white rounded-xl border border-gray-200 p-5">
          {selectedSub ? (
            <div>
              <div className="flex justify-between items-start mb-3">
                <h2 className="font-semibold">
                  {(selectedSub.profiles as unknown as Profile)?.name || 'Student'}
                </h2>
                {hasEdits && (
                  <button
                    onClick={handleSaveEdits}
                    disabled={saving}
                    className="bg-green-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                )}
              </div>

              <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
                <p className="whitespace-pre-wrap line-clamp-6">
                  {selectedSub.final_text}
                </p>
              </div>

              {selectedFeedback ? (
                <div>
                  {selectedFeedback.teacher_edited_at && (
                    <p className="text-xs text-blue-600 mb-3">
                      Reviewed by teacher &middot;{' '}
                      {new Date(selectedFeedback.teacher_edited_at).toLocaleDateString('en-US')}
                    </p>
                  )}
                  <EditableFeedback
                    feedback={selectedFeedback}
                    errorTags={selectedTags}
                    editing={editing}
                    editingRevisions={editingRevisions}
                    onEdit={handleEditField}
                    onEditRevisions={setEditingRevisions}
                  />
                </div>
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

function EditableFeedback({
  feedback,
  errorTags,
  editing,
  editingRevisions,
  onEdit,
  onEditRevisions,
}: {
  feedback: Feedback;
  errorTags: ErrorTag[];
  editing: Record<string, string>;
  editingRevisions: SentenceRevision[] | null;
  onEdit: (field: string, value: string) => void;
  onEditRevisions: (revisions: SentenceRevision[] | null) => void;
}) {
  const groupedErrors = new Map<ErrorType, ErrorTag[]>();
  for (const tag of errorTags) {
    const list = groupedErrors.get(tag.error_type as ErrorType) || [];
    list.push(tag);
    groupedErrors.set(tag.error_type as ErrorType, list);
  }

  const characterErrors = groupedErrors.get('characters') || [];
  const vocabErrors = groupedErrors.get('vocabulary') || [];
  const grammarErrors = groupedErrors.get('grammar') || [];

  const editableFields = [
    { key: 'overall_comment', label: 'Overall Assessment', value: feedback.overall_comment },
    { key: 'characters_comment', label: 'Characters', value: feedback.characters_comment },
    { key: 'vocabulary_comment', label: 'Vocabulary & Word Choice', value: feedback.vocabulary_comment },
    { key: 'grammar_comment', label: 'Grammar', value: feedback.grammar_comment },
    { key: 'content_feedback', label: 'Content & Ideas', value: feedback.content_feedback },
    { key: 'structure_feedback', label: 'Organization & Structure', value: feedback.structure_feedback },
  ];

  const revisions: SentenceRevision[] = editingRevisions ?? feedback.sentence_revisions ?? [];
  const isEditingRevisions = editingRevisions !== null;

  const startEditingRevisions = () => {
    onEditRevisions([...(feedback.sentence_revisions || [])]);
  };

  const updateRevision = (index: number, field: keyof SentenceRevision, value: string) => {
    if (!editingRevisions) return;
    const updated = [...editingRevisions];
    updated[index] = { ...updated[index], [field]: value };
    onEditRevisions(updated);
  };

  const deleteRevision = (index: number) => {
    if (!editingRevisions) return;
    onEditRevisions(editingRevisions.filter((_, i) => i !== index));
  };

  const addRevision = () => {
    const current = editingRevisions || [...(feedback.sentence_revisions || [])];
    onEditRevisions([...current, { original: '', revised: '', explanation: '' }]);
  };

  return (
    <div className="space-y-5">
      {/* Editable text fields: Overall */}
      <EditableTextField
        fieldKey="overall_comment"
        label="Overall Assessment"
        value={feedback.overall_comment}
        editing={editing}
        onEdit={onEdit}
      />

      {/* Sentence Corrections — full view with edit capability */}
      <section>
        <div className="flex justify-between items-center mb-2">
          <h4 className="text-sm font-semibold text-gray-700">Sentence Corrections</h4>
          {!isEditingRevisions ? (
            <button
              onClick={startEditingRevisions}
              className="text-xs text-blue-600 hover:underline"
            >
              Edit
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-orange-600">Editing</span>
              <button
                onClick={addRevision}
                className="text-xs text-blue-600 hover:underline"
              >
                + Add
              </button>
            </div>
          )}
        </div>

        {revisions.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No sentence corrections</p>
        ) : (
          <div className="space-y-3">
            {revisions.map((rev, i) =>
              isEditingRevisions ? (
                <div key={i} className="bg-blue-50 p-3 rounded-lg border border-blue-200 space-y-2">
                  <div className="flex justify-between items-start">
                    <span className="text-xs text-gray-500 font-medium">#{i + 1}</span>
                    <button
                      onClick={() => deleteRevision(i)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Original</label>
                    <textarea
                      value={rev.original}
                      onChange={(e) => updateRevision(i, 'original', e.target.value)}
                      rows={2}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm mt-0.5 focus:ring-2 focus:ring-blue-500 outline-none resize-y"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Revised</label>
                    <textarea
                      value={rev.revised}
                      onChange={(e) => updateRevision(i, 'revised', e.target.value)}
                      rows={2}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm mt-0.5 focus:ring-2 focus:ring-blue-500 outline-none resize-y"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Explanation</label>
                    <textarea
                      value={rev.explanation}
                      onChange={(e) => updateRevision(i, 'explanation', e.target.value)}
                      rows={3}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm mt-0.5 focus:ring-2 focus:ring-blue-500 outline-none resize-y"
                    />
                  </div>
                </div>
              ) : (
                <div key={i} className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                  <div className="text-sm">
                    <span className="text-red-600 line-through">{rev.original}</span>
                  </div>
                  <div className="text-sm mt-1">
                    <span className="text-green-700">&rarr; {rev.revised}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">{rev.explanation}</p>
                </div>
              )
            )}
          </div>
        )}
      </section>

      {/* Characters with error tags */}
      <section>
        <EditableTextField
          fieldKey="characters_comment"
          label="Characters"
          value={feedback.characters_comment}
          editing={editing}
          onEdit={onEdit}
        />
        {characterErrors.length > 0 && (
          <div className="space-y-2 mt-2">
            {characterErrors.map((tag, i) => (
              <ErrorTagCard key={i} tag={tag} />
            ))}
          </div>
        )}
      </section>

      {/* Vocabulary */}
      <section>
        <EditableTextField
          fieldKey="vocabulary_comment"
          label="Vocabulary & Word Choice"
          value={feedback.vocabulary_comment}
          editing={editing}
          onEdit={onEdit}
        />
        {vocabErrors.length > 0 && (
          <div className="space-y-2 mt-2">
            {vocabErrors.map((tag, i) => (
              <ErrorTagCard key={i} tag={tag} />
            ))}
          </div>
        )}
      </section>

      {/* Grammar */}
      <section>
        <EditableTextField
          fieldKey="grammar_comment"
          label="Grammar"
          value={feedback.grammar_comment}
          editing={editing}
          onEdit={onEdit}
        />
        {grammarErrors.length > 0 && (
          <div className="space-y-2 mt-2">
            {grammarErrors.map((tag, i) => (
              <ErrorTagCard key={i} tag={tag} />
            ))}
          </div>
        )}
      </section>

      {/* Content & Ideas */}
      <EditableTextField
        fieldKey="content_feedback"
        label="Content & Ideas"
        value={feedback.content_feedback}
        editing={editing}
        onEdit={onEdit}
      />

      {/* Organization & Structure */}
      <EditableTextField
        fieldKey="structure_feedback"
        label="Organization & Structure"
        value={feedback.structure_feedback}
        editing={editing}
        onEdit={onEdit}
      />
    </div>
  );
}

function EditableTextField({
  fieldKey,
  label,
  value,
  editing,
  onEdit,
}: {
  fieldKey: string;
  label: string;
  value?: string;
  editing: Record<string, string>;
  onEdit: (field: string, value: string) => void;
}) {
  const isEditing = fieldKey in editing;
  const displayValue = isEditing ? editing[fieldKey] : (value || '');

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <h4 className="text-sm font-semibold text-gray-700">{label}</h4>
        {!isEditing ? (
          <button
            onClick={() => onEdit(fieldKey, displayValue)}
            className="text-xs text-blue-600 hover:underline"
          >
            Edit
          </button>
        ) : (
          <span className="text-xs text-orange-600">Editing</span>
        )}
      </div>
      {isEditing ? (
        <textarea
          value={editing[fieldKey]}
          onChange={(e) => onEdit(fieldKey, e.target.value)}
          rows={3}
          className="w-full border border-blue-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-y"
        />
      ) : (
        <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg">
          {displayValue || <span className="text-gray-400 italic">No feedback</span>}
        </p>
      )}
    </div>
  );
}

function ErrorTagCard({ tag }: { tag: ErrorTag }) {
  return (
    <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
      {tag.pattern_name && (
        <span className="text-xs text-blue-600 font-medium">{tag.pattern_name}</span>
      )}
      <div className="text-sm mt-1">
        <span className="text-red-600 line-through">{tag.original_text}</span>
        <span className="text-green-700 ml-2">&rarr; {tag.suggested_revision}</span>
      </div>
      <p className="text-xs text-gray-500 mt-1">{tag.explanation}</p>
    </div>
  );
}
