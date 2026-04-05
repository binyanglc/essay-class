'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Project, Submission, Feedback, ErrorTag, Profile, ErrorType } from '@/types';
import FeedbackView from '@/components/FeedbackView';
import ClassIssues from '@/components/ClassIssues';

interface ClassError {
  error_type: ErrorType;
  count: number;
  examples: { original: string; revision: string; explanation: string }[];
}

export default function ProjectDetailPage() {
  const { id: classId, projectId } = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [selectedSub, setSelectedSub] = useState<Submission | null>(null);
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null);
  const [selectedTags, setSelectedTags] = useState<ErrorTag[]>([]);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [issues, setIssues] = useState<ClassError[]>([]);
  const [issueCount, setIssueCount] = useState(0);
  const [showIssues, setShowIssues] = useState(false);
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

    // Load common issues for this project
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
    if (!selectedFeedback || Object.keys(editing).length === 0) return;
    setSaving(true);

    const res = await fetch(`/api/feedback/${selectedFeedback.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editing),
    });

    if (res.ok) {
      const updated = await res.json();
      setSelectedFeedback(updated);
      setEditing({});
    }
    setSaving(false);
  };

  const hasEdits = Object.keys(editing).length > 0;

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
        <h1 className="text-2xl font-bold mt-1">{project.project_name}</h1>
        {project.description && (
          <p className="text-sm text-gray-500 mt-1">{project.description}</p>
        )}
      </div>

      {/* Common Issues toggle */}
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
          <ClassIssues errors={issues} totalSubmissions={issueCount} />
        </section>
      )}

      {/* Submissions + Feedback */}
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
                    onEdit={handleEditField}
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
  onEdit,
}: {
  feedback: Feedback;
  errorTags: ErrorTag[];
  editing: Record<string, string>;
  onEdit: (field: string, value: string) => void;
}) {
  const editableFields = [
    { key: 'overall_comment', label: 'Overall Assessment', value: feedback.overall_comment },
    { key: 'characters_comment', label: 'Characters', value: feedback.characters_comment },
    { key: 'vocabulary_comment', label: 'Vocabulary & Word Choice', value: feedback.vocabulary_comment },
    { key: 'grammar_comment', label: 'Grammar', value: feedback.grammar_comment },
    { key: 'content_feedback', label: 'Content & Ideas', value: feedback.content_feedback },
    { key: 'structure_feedback', label: 'Organization & Structure', value: feedback.structure_feedback },
  ];

  return (
    <div className="space-y-4">
      {/* Sentence corrections (read-only) */}
      {feedback.sentence_revisions && feedback.sentence_revisions.length > 0 && (
        <section>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Sentence Corrections</h4>
          <div className="space-y-2">
            {feedback.sentence_revisions.map((rev, i) => (
              <div key={i} className="bg-gray-50 p-2 rounded text-xs">
                <span className="text-red-600 line-through">{rev.original}</span>
                <span className="text-green-700 ml-1">&rarr; {rev.revised}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Editable text fields */}
      {editableFields.map(({ key, label, value }) => {
        const isEditing = key in editing;
        const displayValue = isEditing ? editing[key] : (value || '');

        return (
          <section key={key}>
            <div className="flex justify-between items-center mb-1">
              <h4 className="text-sm font-semibold text-gray-700">{label}</h4>
              {!isEditing ? (
                <button
                  onClick={() => onEdit(key, displayValue)}
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
                value={editing[key]}
                onChange={(e) => onEdit(key, e.target.value)}
                rows={3}
                className="w-full border border-blue-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-y"
              />
            ) : (
              <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg">
                {displayValue || <span className="text-gray-400 italic">No feedback</span>}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
