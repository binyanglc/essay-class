'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  Project,
  Submission,
  Feedback,
  ErrorTag,
  Profile,
  ErrorType,
  FeedbackComment,
  SentenceRevision,
  CorrectionLevel,
  CORRECTION_LEVELS,
} from '@/types';
import ClassIssues from '@/components/ClassIssues';
import TeacherCommentThread from '@/components/TeacherCommentThread';
import CompositionReview from '@/components/CompositionReview';
import CorrectionLevelSelect from '@/components/CorrectionLevelSelect';
import ErrorLabels from '@/components/ErrorLabels';
import type { LabelSuggestion } from '@/components/RevisionInspector';
import { labelChangesFor, linkTagsToCorrections } from '@/lib/correction-links';
import {
  addTag as addTagEdit,
  applyTagEdits,
  emptyTagEdits,
  isTagEditsEmpty,
  removeTag as removeTagEdit,
  updateTag as updateTagEdit,
} from '@/lib/tag-edits';
import type { LabelFields, NewTag, TagEdits } from '@/lib/tag-edits';

interface ClassError {
  error_type: ErrorType;
  count: number;
  patterns?: { name: string; count: number }[];
  examples: { id: string; original: string; revision: string; explanation: string; pattern_name?: string }[];
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
  const [tagEdits, setTagEdits] = useState<TagEdits | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [labelSuggestions, setLabelSuggestions] = useState<LabelSuggestion[]>([]);
  const [issues, setIssues] = useState<ClassError[]>([]);
  const [issueCount, setIssueCount] = useState(0);
  const [showIssues, setShowIssues] = useState(false);
  const [editingProject, setEditingProject] = useState(false);
  const [projNameDraft, setProjNameDraft] = useState('');
  const [projDescDraft, setProjDescDraft] = useState('');
  const [projDueDraft, setProjDueDraft] = useState('');
  const [projLevelDraft, setProjLevelDraft] = useState<CorrectionLevel>('standard');
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  // What the teacher currently sees, including unsaved edits
  const currentRevisions: SentenceRevision[] | null = selectedFeedback
    ? editingRevisions ?? selectedFeedback.sentence_revisions ?? []
    : null;
  const visibleTags = selectedSub
    ? applyTagEdits(selectedTags, tagEdits, { submission_id: selectedSub.id, student_id: selectedSub.student_id })
    : [];
  const hasEdits = Object.keys(editing).length > 0 || editingRevisions !== null || !isTagEditsEmpty(tagEdits);

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

    await Promise.all([loadIssues(), loadLabelSuggestions()]);

    if (subs && subs.length > 0) {
      const counts: Record<string, number> = {};
      for (const sub of subs) {
        const { data: fb } = await supabase
          .from('feedback')
          .select('id')
          .eq('submission_id', sub.id)
          .single();
        if (fb) {
          const { count } = await supabase
            .from('feedback_comments')
            .select('id', { count: 'exact', head: true })
            .eq('feedback_id', fb.id);
          if (count && count > 0) counts[sub.id] = count;
        }
      }
      setCommentCounts(counts);
    }

    setLoading(false);
  }

  /** Common Issues is worked out from the saved labels each time it loads — nothing to regenerate. */
  async function loadIssues() {
    try {
      const res = await fetch(`/api/teacher/issues?classId=${classId}&projectId=${projectId}`);
      if (!res.ok) return;
      const issueData = await res.json();
      setIssues(issueData.errorTypes || []);
      setIssueCount(issueData.totalSubmissions || 0);
    } catch {
      // keep what is shown
    }
  }

  /** Label names already used in this class, most used first, so names stay consistent. */
  async function loadLabelSuggestions() {
    const { data } = await supabase
      .from('error_tags')
      .select('error_type, pattern_name, submissions!inner(class_id)')
      .eq('submissions.class_id', classId)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (!data) return;
    const counts = new Map<string, LabelSuggestion & { count: number }>();
    for (const t of data as unknown as { error_type: string; pattern_name: string | null }[]) {
      const name = t.pattern_name?.trim();
      if (!name) continue;
      const key = `${t.error_type}|${name}`;
      const hit = counts.get(key);
      if (hit) hit.count++;
      else counts.set(key, { error_type: t.error_type, pattern_name: name, count: 1 });
    }
    setLabelSuggestions(
      Array.from(counts.values())
        .sort((a, b) => b.count - a.count)
        .map(({ error_type, pattern_name }) => ({ error_type, pattern_name }))
    );
  }

  const [selectedComments, setSelectedComments] = useState<FeedbackComment[]>([]);
  const latestSelection = useRef<string | null>(null);

  const handleSelectSubmission = async (sub: Submission) => {
    if (sub.id === selectedSub?.id) return;
    if (hasEdits && !confirm('You have unsaved changes to this feedback. Discard them?')) return;

    latestSelection.current = sub.id;
    setSelectedSub(sub);
    setSelectedFeedback(null);
    setSelectedTags([]);
    setSelectedComments([]);
    setEditing({});
    setEditingRevisions(null);
    setTagEdits(null);
    setSaveError(null);

    const { data: fb } = await supabase
      .from('feedback')
      .select('*')
      .eq('submission_id', sub.id)
      .single();
    if (latestSelection.current !== sub.id) return;
    setSelectedFeedback(fb);

    const { data: tags } = await supabase
      .from('error_tags')
      .select('*')
      .eq('submission_id', sub.id);
    if (latestSelection.current !== sub.id) return;
    setSelectedTags(tags || []);

    if (fb) {
      loadCommentsForFeedback(fb.id);
    } else {
      setSelectedComments([]);
    }
  };

  const loadCommentsForFeedback = async (feedbackId: string) => {
    const res = await fetch(`/api/feedback/${feedbackId}/comments`);
    if (res.ok) {
      const data = await res.json();
      setSelectedComments(Array.isArray(data) ? data : []);
    }
  };

  /** Label changes wait for Save Changes, like the other feedback edits. */
  const editTags = (fn: (e: TagEdits) => TagEdits) =>
    setTagEdits((prev) => {
      const next = fn(prev ?? emptyTagEdits());
      return isTagEditsEmpty(next) ? null : next;
    });

  /**
   * The teacher changed the corrections. Labels belong to corrections: when a
   * correction is deleted its labels go too, and a label that describes the
   * whole sentence follows the teacher's new suggestion.
   */
  const handleRevisionsChange = (next: SentenceRevision[]) => {
    if (selectedSub && currentRevisions) {
      const { deleted, updated } = labelChangesFor(selectedSub.final_text, currentRevisions, next, visibleTags);
      if (deleted.length || Object.keys(updated).length) {
        editTags((e) => {
          let out = e;
          for (const id of deleted) out = removeTagEdit(out, id);
          for (const [id, suggested_revision] of Object.entries(updated)) {
            out = updateTagEdit(out, id, { suggested_revision });
          }
          return out;
        });
      }
    }
    setEditingRevisions(next);
  };

  const handleAddTag = (tag: Omit<NewTag, 'id'>) => {
    // Already labelled like this: nothing to add
    const same = (t: { error_type: string; pattern_name: string; original_text: string }) =>
      t.error_type === tag.error_type && t.pattern_name === tag.pattern_name && t.original_text === tag.original_text;
    if (visibleTags.some(same)) return;
    editTags((e) => addTagEdit(e, tag));
  };

  const handleUpdateTag = (tagId: string, label: LabelFields) => {
    const tag = visibleTags.find((t) => t.id === tagId);
    if (tag && tag.error_type === label.error_type && tag.pattern_name === label.pattern_name) return;
    editTags((e) => updateTagEdit(e, tagId, label));
  };

  const handleRemoveTag = (tagId: string) => editTags((e) => removeTagEdit(e, tagId));

  const reloadSelectedTags = async (subId: string) => {
    const { data: tags } = await supabase.from('error_tags').select('*').eq('submission_id', subId);
    if (latestSelection.current === subId) setSelectedTags(tags || []);
  };

  /** Sends the label changes; returns the ones that failed so they can be tried again. */
  const saveLabelEdits = async (subId: string, labels: TagEdits): Promise<TagEdits> => {
    const failed = emptyTagEdits();
    const saved = new Map(selectedTags.map((t) => [t.id, t] as [string, ErrorTag]));
    const send = (url: string, method: string, body?: unknown) =>
      fetch(url, {
        method,
        ...(body === undefined
          ? {}
          : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      })
        .then((r) => r.ok)
        .catch(() => false);

    await Promise.all([
      ...labels.added.map(async (t) => {
        const ok = await send('/api/error-tags', 'POST', {
          submission_id: subId,
          error_type: t.error_type,
          pattern_name: t.pattern_name,
          original_text: t.original_text,
          suggested_revision: t.suggested_revision,
          explanation: t.explanation,
        });
        if (!ok) failed.added.push(t);
      }),
      // Labels already gone (e.g. deleted in Common Issues) need nothing
      ...labels.deleted
        .filter((id) => saved.has(id))
        .map(async (id) => {
          if (!(await send(`/api/error-tags/${id}`, 'DELETE'))) failed.deleted.push(id);
        }),
      ...Object.entries(labels.updated)
        .filter(([id]) => saved.has(id) && !labels.deleted.includes(id))
        .map(async ([id, patch]) => {
          // The AI's study tip was written for its own diagnosis: drop it when the teacher renames the label
          const renamed = patch.pattern_name !== undefined && patch.pattern_name !== saved.get(id)?.pattern_name;
          const ok = await send(`/api/error-tags/${id}`, 'PUT', renamed ? { ...patch, improvement_tip: '' } : patch);
          if (!ok) failed.updated[id] = patch;
        }),
    ]);
    return failed;
  };

  const handleEditField = (field: string, value: string) => {
    setEditing((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveEdits = async () => {
    if (!selectedFeedback || !selectedSub) return;
    const hasTextEdits = Object.keys(editing).length > 0;
    const hasRevisionEdits = editingRevisions !== null;
    const labels = isTagEditsEmpty(tagEdits) ? null : tagEdits;
    if (!hasTextEdits && !hasRevisionEdits && !labels) return;

    const subId = selectedSub.id;
    setSaving(true);
    setSaveError(null);

    if (hasTextEdits || hasRevisionEdits) {
      const body: Record<string, unknown> = { ...editing };
      if (hasRevisionEdits) {
        body.sentence_revisions = editingRevisions;
      }
      const res = await fetch(`/api/feedback/${selectedFeedback.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).catch(() => null);
      if (!res?.ok) {
        setSaveError('Could not save your changes. Please try again.');
        setSaving(false);
        return;
      }
      const updated = await res.json();
      if (latestSelection.current === subId) {
        setSelectedFeedback(updated);
        setEditing({});
        setEditingRevisions(null);
      }
    }

    if (labels) {
      const failed = await saveLabelEdits(subId, labels);
      if (latestSelection.current === subId) {
        const allSaved = isTagEditsEmpty(failed);
        setTagEdits(allSaved ? null : failed);
        if (!allSaved) setSaveError("Some label changes couldn't be saved. Click Save to try again.");
      }
      await reloadSelectedTags(subId);
      loadLabelSuggestions();
    }

    // Common Issues counts the saved labels: refresh it now
    loadIssues();
    setSaving(false);
  };

  // Examples edited in Common Issues are labels too
  const handleIssuesChanged = () => {
    loadIssues();
    if (selectedSub) reloadSelectedTags(selectedSub.id);
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
        correctionLevel: projLevelDraft,
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

  // Warn before leaving the page with unsaved feedback edits
  useEffect(() => {
    if (!hasEdits) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasEdits]);

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
            <CorrectionLevelSelect
              id="project-correction-level"
              value={projLevelDraft}
              onChange={setProjLevelDraft}
              existingProject
            />
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
                  setProjLevelDraft(project.correction_level ?? 'standard');
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
            <p className="text-xs mt-1 text-gray-400">
              AI corrections:{' '}
              {CORRECTION_LEVELS.find((l) => l.value === (project.correction_level ?? 'standard'))?.label}
            </p>
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
          onClick={() => {
            if (!showIssues) loadIssues();
            setShowIssues(!showIssues);
          }}
          className="bg-orange-500 text-white px-5 py-2.5 rounded-lg text-sm hover:bg-orange-600 font-medium"
        >
          {showIssues ? 'Hide' : 'Show'} Common Issues ({issueCount} submissions)
        </button>
      </div>

      {showIssues && (
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <ClassIssues errors={issues} totalSubmissions={issueCount} onRefresh={handleIssuesChanged} />
        </section>
      )}

      {/* Narrow list on the left, wide review area on the right (desktop) */}
      <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-6 items-start">
        <section className="bg-white rounded-xl border border-gray-200 p-4 lg:sticky lg:top-20">
          <h2 className="font-semibold mb-3">
            Submissions ({submissions.length})
          </h2>
          {submissions.length === 0 ? (
            <p className="text-gray-500 text-sm">No submissions yet</p>
          ) : (
            <div className="space-y-2 max-h-[600px] lg:max-h-[calc(100vh-11rem)] overflow-y-auto">
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
                            {commentCounts[sub.id] > 0 && (
                              <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-full">
                                {commentCounts[sub.id]}
                              </span>
                            )}
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
              {saveError && (
                <p role="alert" className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                  {saveError}
                </p>
              )}

              <CompositionReview
                key={selectedSub.id}
                text={selectedSub.final_text}
                imagePath={selectedSub.image_path}
                revisions={currentRevisions}
                partial={!!selectedFeedback && !selectedFeedback.correction_level}
                errorTags={visibleTags}
                role="teacher"
                feedbackId={selectedFeedback?.id}
                comments={selectedComments}
                onRefreshComments={() => selectedFeedback && loadCommentsForFeedback(selectedFeedback.id)}
                onChangeRevisions={selectedFeedback ? handleRevisionsChange : undefined}
                onRemoveTag={selectedFeedback ? handleRemoveTag : undefined}
                onAddTag={selectedFeedback ? handleAddTag : undefined}
                onUpdateTag={selectedFeedback ? handleUpdateTag : undefined}
                labelSuggestions={labelSuggestions}
                className="mb-6"
              />

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
                    compositionText={selectedSub.final_text}
                    revisions={currentRevisions}
                    errorTags={visibleTags}
                    onRemoveTag={handleRemoveTag}
                    editing={editing}
                    onEdit={handleEditField}
                    comments={selectedComments}
                    onRefreshComments={() => loadCommentsForFeedback(selectedFeedback.id)}
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

      {hasEdits && (
        <div className="fixed bottom-5 right-5 z-50 hidden items-center gap-3 rounded-full bg-gray-900 py-2 pl-4 pr-2 text-sm text-white shadow-lg lg:flex">
          <span>Unsaved changes</span>
          <button
            onClick={handleSaveEdits}
            disabled={saving}
            className="rounded-full bg-green-600 px-3 py-1 text-sm hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      )}
    </div>
  );
}

function EditableFeedback({
  feedback,
  compositionText,
  revisions,
  errorTags,
  onRemoveTag,
  editing,
  onEdit,
  comments,
  onRefreshComments,
}: {
  feedback: Feedback;
  compositionText: string;
  revisions: SentenceRevision[] | null;
  errorTags: ErrorTag[];
  onRemoveTag: (tagId: string) => void;
  editing: Record<string, string>;
  onEdit: (field: string, value: string) => void;
  comments: FeedbackComment[];
  onRefreshComments: () => void;
}) {
  const groupedErrors = new Map<ErrorType, ErrorTag[]>();
  for (const tag of errorTags) {
    const list = groupedErrors.get(tag.error_type as ErrorType) || [];
    list.push(tag);
    groupedErrors.set(tag.error_type as ErrorType, list);
  }

  // Labels link to the corrections in the composition (edit them there)
  const links = linkTagsToCorrections(compositionText, revisions, errorTags);
  const characterErrors = groupedErrors.get('characters') || [];
  const vocabErrors = groupedErrors.get('vocabulary') || [];
  const grammarErrors = groupedErrors.get('grammar') || [];

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
      <TeacherCommentThread feedbackId={feedback.id} section="overall" comments={comments} onRefresh={onRefreshComments} />

      {/* Characters with error tags */}
      <section>
        <EditableTextField
          fieldKey="characters_comment"
          label="Characters"
          value={feedback.characters_comment}
          editing={editing}
          onEdit={onEdit}
        />
        <ErrorLabels tags={characterErrors} links={links} onRemove={onRemoveTag} />
        <TeacherCommentThread feedbackId={feedback.id} section="characters" comments={comments} onRefresh={onRefreshComments} />
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
        <ErrorLabels tags={vocabErrors} links={links} onRemove={onRemoveTag} />
        <TeacherCommentThread feedbackId={feedback.id} section="vocabulary" comments={comments} onRefresh={onRefreshComments} />
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
        <ErrorLabels tags={grammarErrors} links={links} onRemove={onRemoveTag} />
        <TeacherCommentThread feedbackId={feedback.id} section="grammar" comments={comments} onRefresh={onRefreshComments} />
      </section>

      {/* Content & Ideas */}
      <div>
        <EditableTextField
          fieldKey="content_feedback"
          label="Content & Ideas"
          value={feedback.content_feedback}
          editing={editing}
          onEdit={onEdit}
        />
        <TeacherCommentThread feedbackId={feedback.id} section="content" comments={comments} onRefresh={onRefreshComments} />
      </div>

      {/* Organization & Structure */}
      <div>
        <EditableTextField
          fieldKey="structure_feedback"
          label="Organization & Structure"
          value={feedback.structure_feedback}
          editing={editing}
          onEdit={onEdit}
        />
        <TeacherCommentThread feedbackId={feedback.id} section="structure" comments={comments} onRefresh={onRefreshComments} />
      </div>
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

