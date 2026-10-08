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
  FEEDBACK_STYLES,
  FeedbackRelease,
  FeedbackStyle,
  DEFAULT_MAX_DRAFTS,
} from '@/types';
import ClassIssues from '@/components/ClassIssues';
import TeacherCommentThread from '@/components/TeacherCommentThread';
import CompositionReview from '@/components/CompositionReview';
import CorrectionLevelSelect from '@/components/CorrectionLevelSelect';
import FeedbackReleaseSelect from '@/components/FeedbackReleaseSelect';
import FeedbackStyleSelect from '@/components/FeedbackStyleSelect';
import HintsView from '@/components/HintsView';
import { fetchHintView } from '@/lib/hints';
import type { HintView } from '@/lib/hints';
import DraftsSelect from '@/components/DraftsSelect';
import DraftProgress, { DraftChanges } from '@/components/DraftProgress';
import { draftDiff, draftNumber, draftProgress, groupDrafts, itemsFromRevisions } from '@/lib/drafts';
import ErrorLabels, { ExtraLabelSections } from '@/components/ErrorLabels';
import type { LabelSuggestion } from '@/components/RevisionInspector';
import { labelChangesFor, linkTagsToCorrections } from '@/lib/correction-links';
import {
  addTag as addTagEdit,
  applyTagEdits,
  changesLabel,
  confirmTags,
  emptyTagEdits,
  isTagEditsEmpty,
  removeTag as removeTagEdit,
  updateTag as updateTagEdit,
} from '@/lib/tag-edits';
import type { LabelFields, NewTag, TagEdits } from '@/lib/tag-edits';
import { isActive, isUnconfirmedAi } from '@/lib/error-taxonomy';
import type { DeleteReason } from '@/lib/error-taxonomy';
import type { IssueGroup } from '@/lib/error-tracking';
import { isWaitingForRelease, markFeedbackViewed } from '@/lib/feedback-release';

type ReleaseInfo = { feedbackId: string; releasedAt: string | null; viewedAt: string | null };

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
  const [issues, setIssues] = useState<IssueGroup[]>([]);
  const [issueCount, setIssueCount] = useState(0);
  const [issueStyleCount, setIssueStyleCount] = useState(0);
  const [includeStyle, setIncludeStyle] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [editingProject, setEditingProject] = useState(false);
  const [projNameDraft, setProjNameDraft] = useState('');
  const [projDescDraft, setProjDescDraft] = useState('');
  const [projDueDraft, setProjDueDraft] = useState('');
  const [projLevelDraft, setProjLevelDraft] = useState<CorrectionLevel>('standard');
  const [projReleaseDraft, setProjReleaseDraft] = useState<FeedbackRelease>('immediate');
  const [projStyleDraft, setProjStyleDraft] = useState<FeedbackStyle>('corrections');
  const [projDraftsDraft, setProjDraftsDraft] = useState(DEFAULT_MAX_DRAFTS);
  // The draft before the open one (migration v17): its text and the corrections it had
  const [prevDraft, setPrevDraft] = useState<{ sub: Submission; revisions: SentenceRevision[] } | null>(null);
  const [showDraftChanges, setShowDraftChanges] = useState(false);
  // Common Issues counts each composition once: by its first draft, or its latest
  const [issuesDraft, setIssuesDraft] = useState<'first' | 'latest'>('first');
  // "Hints only": what the student sees (the saved version), shown instead of the editor
  const [studentPreview, setStudentPreview] = useState<HintView | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  // Each submission's feedback: can the student see it yet (null = not released), has the teacher opened it
  const [releaseInfo, setReleaseInfo] = useState<Record<string, ReleaseInfo>>({});
  const [releasing, setReleasing] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);
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
  const waitingIds = submissions.filter((s) => releaseInfo[s.id]?.releasedAt === null).map((s) => s.id);
  const openedWaitingIds = waitingIds.filter((id) => releaseInfo[id]?.viewedAt);
  // One entry per composition, its drafts in order (newest compositions first)
  const compositions = groupDrafts(submissions);
  const selectedGroup = selectedSub ? compositions.find((g) => g.some((d) => d.id === selectedSub.id)) ?? [selectedSub] : [];
  const hasLaterDrafts = submissions.some((s) => draftNumber(s) > 1);
  // How the previous draft's problems fared (follows the teacher's unsaved edits)
  const progress =
    selectedSub && prevDraft && currentRevisions
      ? (() => {
          const prevItems = itemsFromRevisions(prevDraft.sub.final_text, prevDraft.revisions);
          return {
            problems: prevItems.map((p) => ({ id: p.id, original: p.original })),
            statuses: draftProgress(
              prevDraft.sub.final_text,
              prevItems,
              selectedSub.final_text,
              itemsFromRevisions(selectedSub.final_text, currentRevisions)
            ),
          };
        })()
      : null;

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (!loading) loadIssues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeStyle, issuesDraft]);

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

    const info = await loadReleaseInfo();
    setReleaseInfo(info);
    const counts: Record<string, number> = {};
    for (const [subId, fb] of Object.entries(info)) {
      const { count } = await supabase
        .from('feedback_comments')
        .select('id', { count: 'exact', head: true })
        .eq('feedback_id', fb.feedbackId);
      if (count && count > 0) counts[subId] = count;
    }
    setCommentCounts(counts);

    setLoading(false);
  }

  /** Each submission's feedback id and release time, for the whole project in one request. */
  async function loadReleaseInfo() {
    const info: Record<string, ReleaseInfo> = {};
    const { data } = await supabase
      .from('feedback')
      .select('id, submission_id, released_at, teacher_viewed_at, submissions!inner(project_id)')
      .eq('submissions.project_id', projectId);
    for (const fb of (data ?? []) as unknown as Pick<Feedback, 'id' | 'submission_id' | 'released_at' | 'teacher_viewed_at'>[]) {
      info[fb.submission_id] = { feedbackId: fb.id, releasedAt: fb.released_at ?? null, viewedAt: fb.teacher_viewed_at ?? null };
    }
    return info;
  }

  /** Lets the students see their feedback. Returns whether it worked. */
  const releaseFeedback = async (subIds: string[]): Promise<boolean> => {
    const feedbackIds = subIds.map((id) => releaseInfo[id]?.feedbackId).filter((id): id is string => !!id);
    if (feedbackIds.length === 0) return false;
    setReleasing(true);
    setReleaseError(null);
    const res = await fetch('/api/feedback/release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedbackIds }),
    }).catch(() => null);
    // Read back what is saved now (some may have been released elsewhere meanwhile)
    const fresh = await loadReleaseInfo();
    setReleaseInfo(fresh);
    setSelectedFeedback((prev) => {
      const now = prev && fresh[prev.submission_id];
      return prev && now ? { ...prev, released_at: now.releasedAt } : prev;
    });
    // AI labels in feedback the teacher had opened are now kept: show that
    if (selectedSub && subIds.includes(selectedSub.id)) await reloadSelectedTags(selectedSub.id);
    loadIssues();
    setReleasing(false);
    if (!res?.ok) {
      setReleaseError("Couldn't release the feedback. Please try again.");
      return false;
    }
    return true;
  };

  /** Common Issues is worked out from the saved labels each time it loads — nothing to regenerate. */
  async function loadIssues() {
    try {
      const res = await fetch(
        `/api/teacher/issues?classId=${classId}&projectId=${projectId}${includeStyle ? '&style=1' : ''}${
          issuesDraft === 'latest' ? '&draft=latest' : ''
        }`
      );
      if (!res.ok) return;
      const issueData = await res.json();
      setIssues(issueData.errorTypes || []);
      setIssueCount(issueData.totalSubmissions || 0);
      setIssueStyleCount(issueData.styleCount || 0);
    } catch {
      // keep what is shown
    }
  }

  /** The teacher's own label names already used in this class, most used first, so names stay consistent. */
  async function loadLabelSuggestions() {
    const { data } = await supabase
      .from('error_tags')
      .select('code, custom_label, status, submissions!inner(class_id)')
      .eq('submissions.class_id', classId)
      .not('custom_label', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (!data) return;
    const counts = new Map<string, LabelSuggestion & { count: number }>();
    for (const t of data as unknown as { code: string | null; custom_label: string | null; status: string | null }[]) {
      const name = t.custom_label?.trim();
      if (!name || !t.code || !isActive(t)) continue;
      const key = `${t.code}|${name}`;
      const hit = counts.get(key);
      if (hit) hit.count++;
      else counts.set(key, { code: t.code, custom_label: name, count: 1 });
    }
    setLabelSuggestions(
      Array.from(counts.values())
        .sort((a, b) => b.count - a.count)
        .map(({ code, custom_label }) => ({ code, custom_label }))
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
    setStudentPreview(null);
    setPrevDraft(null);
    setShowDraftChanges(false);

    // A later draft: load the one before, to compare
    const n = draftNumber(sub);
    if (n > 1) {
      const prev = submissions.find(
        (d) => (d.first_draft_id ?? d.id) === sub.first_draft_id && draftNumber(d) === n - 1
      );
      if (prev) {
        supabase
          .from('feedback')
          .select('sentence_revisions')
          .eq('submission_id', prev.id)
          .maybeSingle()
          .then(({ data }) => {
            if (latestSelection.current === sub.id) {
              setPrevDraft({ sub: prev, revisions: (data?.sentence_revisions ?? []) as SentenceRevision[] });
            }
          });
      }
    }

    const { data: fb } = await supabase
      .from('feedback')
      .select('*')
      .eq('submission_id', sub.id)
      .single();
    if (latestSelection.current !== sub.id) return;
    setSelectedFeedback(fb);
    // Opening it counts as reviewing it (for "Release reviewed", and so its AI labels count as kept on release)
    if (fb && !fb.teacher_viewed_at) {
      markFeedbackViewed(fb.id).then((at) => {
        const viewedAt = at ?? new Date().toISOString();
        setReleaseInfo((prev) => (prev[sub.id] ? { ...prev, [sub.id]: { ...prev[sub.id], viewedAt } } : prev));
        setSelectedFeedback((prev) => (prev && prev.id === fb.id ? { ...prev, teacher_viewed_at: viewedAt } : prev));
      });
    }

    const { data: tags } = await supabase
      .from('error_tags')
      .select('*')
      .eq('submission_id', sub.id);
    if (latestSelection.current !== sub.id) return;
    setSelectedTags(((tags || []) as ErrorTag[]).filter(isActive));

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

  const sameLabel = (t: ErrorTag, l: LabelFields) =>
    (t.code ?? null) === l.code &&
    (t.rule ?? null) === l.rule &&
    (t.item_target ?? null) === l.item_target &&
    (t.item_learner ?? null) === l.item_learner &&
    (t.grammar_point ?? null) === (l.grammar_point ?? null);

  const handleAddTag = (tag: Omit<NewTag, 'id'>) => {
    // Already labelled like this: nothing to add
    if (visibleTags.some((t) => sameLabel(t, tag) && (t.revision_id ?? t.original_text) === (tag.revision_id ?? tag.original_text))) {
      return;
    }
    editTags((e) => addTagEdit(e, tag));
  };

  const handleUpdateTag = (tagId: string, label: LabelFields) => {
    const tag = visibleTags.find((t) => t.id === tagId);
    if (
      tag &&
      sameLabel(tag, label) &&
      (tag.nature ?? 'error') === label.nature &&
      (tag.custom_label ?? null) === label.custom_label
    ) {
      return;
    }
    editTags((e) => updateTagEdit(e, tagId, label));
  };

  const handleRemoveTag = (tagId: string, reason: DeleteReason | null = null) =>
    editTags((e) => removeTagEdit(e, tagId, reason));

  const handleConfirmTag = (tagId: string) => editTags((e) => confirmTags(e, [tagId]));

  /** Keeps every AI label the teacher hasn't changed or removed. */
  const handleConfirmAllTags = () =>
    editTags((e) => confirmTags(e, visibleTags.filter(isUnconfirmedAi).map((t) => t.id)));

  const reloadSelectedTags = async (subId: string) => {
    const { data: tags } = await supabase.from('error_tags').select('*').eq('submission_id', subId);
    if (latestSelection.current === subId) setSelectedTags(((tags || []) as ErrorTag[]).filter(isActive));
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
          code: t.code,
          rule: t.rule,
          item_target: t.item_target,
          item_learner: t.item_learner,
          nature: t.nature,
          custom_label: t.custom_label,
          grammar_point: t.grammar_point ?? null,
          original_text: t.original_text,
          suggested_revision: t.suggested_revision,
          explanation: t.explanation,
          revision_id: t.revision_id,
        });
        if (!ok) failed.added.push(t);
      }),
      // Labels already gone (e.g. deleted in Common Issues) need nothing
      ...labels.deleted
        .filter((id) => saved.has(id))
        .map(async (id) => {
          const reason = labels.deleteReasons[id] ?? null;
          if (!(await send(`/api/error-tags/${id}`, 'DELETE', { reason }))) {
            failed.deleted.push(id);
            if (reason) failed.deleteReasons[id] = reason;
          }
        }),
      ...Object.entries(labels.updated)
        .filter(([id]) => saved.has(id) && !labels.deleted.includes(id))
        .map(async ([id, patch]) => {
          // A label the teacher also checked: one request (a changed label is "modified" anyway)
          const confirm = labels.confirmed.includes(id) && !changesLabel(patch);
          const ok = await send(`/api/error-tags/${id}`, 'PUT', confirm ? { ...patch, status: 'confirmed' } : patch);
          if (!ok) {
            failed.updated[id] = patch;
            if (confirm) failed.confirmed.push(id);
          }
        }),
      ...labels.confirmed
        .filter((id) => saved.has(id) && !labels.deleted.includes(id) && !labels.updated[id])
        .map(async (id) => {
          if (!(await send(`/api/error-tags/${id}`, 'PUT', { status: 'confirmed' }))) failed.confirmed.push(id);
        }),
    ]);
    return failed;
  };

  const handleEditField = (field: string, value: string) => {
    setEditing((prev) => ({ ...prev, [field]: value }));
  };

  /** Saves the teacher's changes; returns whether everything was saved. */
  const handleSaveEdits = async (): Promise<boolean> => {
    if (!selectedFeedback || !selectedSub) return false;
    const hasTextEdits = Object.keys(editing).length > 0;
    const hasRevisionEdits = editingRevisions !== null;
    const labels = isTagEditsEmpty(tagEdits) ? null : tagEdits;
    if (!hasTextEdits && !hasRevisionEdits && !labels) return true;

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
        return false;
      }
      const updated = await res.json();
      if (latestSelection.current === subId) {
        setSelectedFeedback(updated);
        setEditing({});
        setEditingRevisions(null);
      }
    }

    let allSaved = true;
    if (labels) {
      const failed = await saveLabelEdits(subId, labels);
      allSaved = isTagEditsEmpty(failed);
      if (latestSelection.current === subId) {
        setTagEdits(allSaved ? null : failed);
        if (!allSaved) setSaveError("Some label changes couldn't be saved. Click Save to try again.");
      }
      await reloadSelectedTags(subId);
      loadLabelSuggestions();
    }

    // Common Issues counts the saved labels: refresh it now
    loadIssues();
    // The student view (if open) shows what is saved
    if (studentPreview && latestSelection.current === subId) {
      const view = await fetchHintView(supabase, subId);
      if (latestSelection.current === subId) setStudentPreview(view);
    }
    setSaving(false);
    return allSaved;
  };

  /** Release the open submission's feedback; unsaved changes are saved first. */
  const handleReleaseSelected = async () => {
    if (!selectedSub) return;
    if (hasEdits && !(await handleSaveEdits())) return;
    await releaseFeedback([selectedSub.id]);
  };

  /** Only the submissions the teacher has reviewed (opened). */
  const handleReleaseReviewed = async () => {
    const n = openedWaitingIds.length;
    if (n === 0 || hasEdits) return;
    if (!confirm(`Release the feedback you've reviewed to ${n} student${n === 1 ? '' : 's'}? They will see it straight away.`)) return;
    await releaseFeedback(openedWaitingIds);
  };

  const handleReleaseAll = async () => {
    const n = waitingIds.length;
    if (n === 0 || hasEdits) return;
    const notOpened = n - openedWaitingIds.length;
    const warning =
      notOpened === 0
        ? ''
        : notOpened === n
          ? ` You haven't reviewed ${n === 1 ? 'it' : 'any of them'}, so ${n === 1 ? 'its' : 'their'} AI labels will show as AI suggestions.`
          : ` You haven't reviewed ${notOpened} of them, so ${notOpened === 1 ? 'its' : 'their'} AI labels will show as AI suggestions.`;
    const who = n === 1 ? '1 student' : `all ${n} students`;
    if (!confirm(`Release the feedback to ${who}? They will see it straight away.${warning}`)) return;
    await releaseFeedback(waitingIds);
  };

  // Examples edited in Common Issues are labels too
  const handleIssuesChanged = () => {
    loadIssues();
    if (selectedSub) reloadSelectedTags(selectedSub.id);
  };

  /** "Hints only": show exactly what the student gets (from the database), or go back to editing. */
  const toggleStudentPreview = async () => {
    if (studentPreview) {
      setStudentPreview(null);
      return;
    }
    if (!selectedSub) return;
    const subId = selectedSub.id;
    setPreviewLoading(true);
    const view = await fetchHintView(supabase, subId);
    setPreviewLoading(false);
    if (latestSelection.current !== subId) return;
    if (view) setStudentPreview(view);
    else setSaveError("Couldn't load the student view. Please try again.");
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
        feedbackRelease: projReleaseDraft,
        feedbackStyle: projStyleDraft,
        maxDrafts: projDraftsDraft,
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

  /** Deletes a composition: its first draft takes the later drafts with it. */
  const handleDeleteSubmission = async (subId: string, drafts = 1) => {
    if (!confirm(drafts > 1 ? `Delete this submission (all ${drafts} drafts) and its feedback?` : 'Delete this submission and its feedback?')) return;
    const res = await fetch(`/api/submissions/${subId}`, { method: 'DELETE' });
    if (res.ok) {
      if (selectedSub && (selectedSub.id === subId || selectedSub.first_draft_id === subId)) {
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
            <FeedbackStyleSelect
              id="project-feedback-style"
              value={projStyleDraft}
              onChange={setProjStyleDraft}
              existingProject
            />
            <CorrectionLevelSelect
              id="project-correction-level"
              value={projLevelDraft}
              onChange={setProjLevelDraft}
              existingProject
            />
            <FeedbackReleaseSelect
              id="project-feedback-release"
              value={projReleaseDraft}
              onChange={setProjReleaseDraft}
              existingProject
            />
            <DraftsSelect id="project-drafts" value={projDraftsDraft} onChange={setProjDraftsDraft} existingProject />
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
                  setProjReleaseDraft(project.feedback_release ?? 'immediate');
                  setProjStyleDraft(project.feedback_style ?? 'corrections');
                  setProjDraftsDraft(project.max_drafts ?? DEFAULT_MAX_DRAFTS);
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
              Feedback: {FEEDBACK_STYLES.find((st) => st.value === (project.feedback_style ?? 'corrections'))?.label}
              {' '}&middot; AI checking:{' '}
              {CORRECTION_LEVELS.find((l) => l.value === (project.correction_level ?? 'standard'))?.label}
              {' '}&middot; Students see the feedback:{' '}
              {project.feedback_release === 'after_review' ? 'after you release it' : 'right after they submit'}
              {' '}&middot; Drafts: {project.max_drafts ?? DEFAULT_MAX_DRAFTS}
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
        {showIssues && hasLaterDrafts && (
          <span className="ml-3 inline-flex rounded-md bg-gray-200/70 p-0.5 text-xs" role="tablist" aria-label="Which drafts count">
            {(['first', 'latest'] as const).map((d) => (
              <button
                key={d}
                role="tab"
                aria-selected={issuesDraft === d}
                onClick={() => setIssuesDraft(d)}
                className={`rounded px-2.5 py-1 ${issuesDraft === d ? 'bg-white font-medium text-gray-900 shadow-sm' : 'text-gray-600'}`}
              >
                {d === 'first' ? 'First drafts' : 'Latest drafts'}
              </button>
            ))}
          </span>
        )}
      </div>

      {showIssues && (
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <ClassIssues
            errors={issues}
            totalSubmissions={issueCount}
            styleCount={issueStyleCount}
            includeStyle={includeStyle}
            onToggleStyle={setIncludeStyle}
            onRefresh={handleIssuesChanged}
          />
        </section>
      )}

      {/* Narrow list on the left, wide review area on the right (desktop) */}
      <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-6 items-start">
        <section className="bg-white rounded-xl border border-gray-200 p-4 lg:sticky lg:top-20">
          <h2 className="font-semibold mb-3">
            Submissions ({compositions.length})
          </h2>
          {waitingIds.length > 0 && (
            <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <p>
                {waitingIds.length} not released &mdash; {waitingIds.length === 1 ? 'that student' : 'those students'}{' '}
                can&apos;t see the feedback yet.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {openedWaitingIds.length > 0 && openedWaitingIds.length < waitingIds.length && (
                  <button
                    onClick={handleReleaseReviewed}
                    disabled={releasing || hasEdits}
                    title={hasEdits ? 'Save your changes first' : 'Only the ones you have opened and checked'}
                    className="rounded-md bg-amber-600 px-2.5 py-1 font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    Release reviewed ({openedWaitingIds.length})
                  </button>
                )}
                <button
                  onClick={handleReleaseAll}
                  disabled={releasing || hasEdits}
                  title={hasEdits ? 'Save your changes first' : 'Let every student see their feedback'}
                  className="rounded-md bg-white px-2.5 py-1 font-medium text-amber-900 ring-1 ring-inset ring-amber-300 hover:bg-amber-100 disabled:opacity-50"
                >
                  {releasing ? 'Releasing...' : `Release all (${waitingIds.length})`}
                </button>
              </div>
            </div>
          )}
          {submissions.length === 0 ? (
            <p className="text-gray-500 text-sm">No submissions yet</p>
          ) : (
            <div className="space-y-2 max-h-[600px] lg:max-h-[calc(100vh-11rem)] overflow-y-auto">
              {compositions.map((group) => {
                const sub = group[group.length - 1];
                const profile = sub.profiles as unknown as Profile;
                const selected = group.some((d) => d.id === selectedSub?.id);
                const comments = group.reduce((n, d) => n + (commentCounts[d.id] ?? 0), 0);
                const waiting = group.filter((d) => releaseInfo[d.id]?.releasedAt === null);
                return (
                  <div
                    key={group[0].id}
                    className={`p-3 rounded-lg border transition-colors ${
                      selected ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <button onClick={() => handleSelectSubmission(sub)} className="flex-1 text-left min-w-0">
                        <div className="flex justify-between">
                          <span className="text-sm font-medium">
                            {profile?.name || 'Unknown'}
                            {comments > 0 && (
                              <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-full">
                                {comments}
                              </span>
                            )}
                          </span>
                          <span className="text-xs text-gray-400">{new Date(sub.created_at).toLocaleDateString('en-US')}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1 line-clamp-1">{sub.final_text.substring(0, 60)}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {group.length > 1 && (
                            <span className="inline-block rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
                              Draft {draftNumber(sub)}
                            </span>
                          )}
                          {waiting.length > 0 && (
                            <span className="inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                              {waiting.every((d) => releaseInfo[d.id]?.viewedAt) ? 'Not released' : 'Not released · not reviewed'}
                            </span>
                          )}
                        </div>
                      </button>
                      <button
                        onClick={() => handleDeleteSubmission(group[0].id, group.length)}
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
              {selectedGroup.length > 1 && (
                <nav aria-label="Drafts" className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
                  {selectedGroup.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => handleSelectSubmission(d)}
                      className={`rounded-full px-2.5 py-1 ${
                        d.id === selectedSub.id ? 'bg-blue-600 font-medium text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Draft {draftNumber(d)}
                      {releaseInfo[d.id]?.releasedAt === null ? ' · not released' : ''}
                    </button>
                  ))}
                </nav>
              )}
              {saveError && (
                <p role="alert" className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                  {saveError}
                </p>
              )}
              {releaseError && (
                <p role="alert" className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                  {releaseError}
                </p>
              )}
              {isWaitingForRelease(selectedFeedback) && (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                  <span>
                    <span className="font-semibold">Not released.</span>{' '}
                    The student can&apos;t see this feedback
                    yet. Check it, then release it.
                    {visibleTags.some(isUnconfirmedAi) && (
                      <span className="block text-xs text-amber-800">
                        Releasing also keeps the AI labels you haven&apos;t changed or removed.
                      </span>
                    )}
                  </span>
                  <button
                    onClick={handleReleaseSelected}
                    disabled={releasing || saving}
                    className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    {releasing ? 'Releasing...' : hasEdits ? 'Save & release' : 'Release to student'}
                  </button>
                </div>
              )}
              {selectedFeedback?.released_at && project.feedback_release === 'after_review' && (
                <p className="mb-3 text-xs text-green-700">
                  Released to the student &middot;{' '}
                  {new Date(selectedFeedback.released_at).toLocaleDateString('en-US')}
                </p>
              )}

              {prevDraft && (
                <div className="mb-4 space-y-3">
                  {progress && (
                    <DraftProgress
                      problems={progress.problems}
                      statuses={progress.statuses}
                      prevLabel={`draft ${draftNumber(prevDraft.sub)}`}
                      forTeacher
                    />
                  )}
                  <button
                    onClick={() => setShowDraftChanges((v) => !v)}
                    className="text-xs font-medium text-blue-600 hover:underline"
                  >
                    {showDraftChanges ? 'Hide' : 'Show'} what the student changed from draft {draftNumber(prevDraft.sub)}
                  </button>
                  {showDraftChanges && <DraftChanges ops={draftDiff(prevDraft.sub.final_text, selectedSub.final_text)} />}
                </div>
              )}

              {selectedFeedback?.feedback_style === 'hints' && (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5 text-sm text-blue-900">
                  <span>
                    <span className="font-semibold">Hints only.</span> The student sees where each problem is, its
                    labels and the hint — not your suggestions or explanations.
                  </span>
                  <button
                    onClick={toggleStudentPreview}
                    disabled={previewLoading}
                    className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-blue-800 ring-1 ring-inset ring-blue-200 hover:bg-blue-100 disabled:opacity-50"
                  >
                    {studentPreview ? 'Back to editing' : previewLoading ? 'Loading...' : 'Student view'}
                  </button>
                </div>
              )}

              {studentPreview ? (
                <div className="mb-6">
                  {hasEdits && (
                    <p className="mb-3 text-xs text-amber-700">
                      This shows what is saved — save your changes to see them here.
                    </p>
                  )}
                  <HintsView text={selectedSub.final_text} view={studentPreview} preview label="Student view" />
                </div>
              ) : (
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
                onConfirmTag={selectedFeedback ? handleConfirmTag : undefined}
                onConfirmAllTags={selectedFeedback ? handleConfirmAllTags : undefined}
                labelSuggestions={labelSuggestions}
                hintMode={selectedFeedback?.feedback_style === 'hints'}
                className="mb-6"
              />
              )}

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
  onRemoveTag: (tagId: string, reason: DeleteReason | null) => void;
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

      {/* Punctuation, linking, register, natural expression: only when there are labels */}
      <ExtraLabelSections tags={errorTags} links={links} onRemove={onRemoveTag} />

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

