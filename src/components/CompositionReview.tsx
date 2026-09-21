'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { placeRevisions, rebaseRevision } from '@/lib/track-changes';
import { linkTags, onFocusCorrection } from '@/lib/correction-links';
import { commentKeyFor, newRevisionId, withRevisionIds } from '@/lib/revisions';
import type { Revision } from '@/lib/revisions';
import type { ErrorTag, ErrorType, FeedbackComment, SentenceRevision } from '@/types';
import TrackChangesView, { DEL_CLASS, DiffOps, INS_CLASS, NumberBadge } from './TrackChangesView';
import type { EssayMode } from './TrackChangesView';
import RevisionInspector, { TypeChip } from './RevisionInspector';
import type { Draft, LabelSuggestion, TagChip } from './RevisionInspector';
import CompositionPhoto from './CompositionPhoto';
import TeacherCommentThread from './TeacherCommentThread';
import { CommentThread } from './FeedbackView';

type Mode = EssayMode | 'photo';

const MODE_LABELS: Record<Mode, string> = {
  track: 'Track changes',
  original: 'Original',
  revised: 'Revised',
  photo: 'Photo',
};

interface Props {
  text: string;
  /** Storage path of the uploaded photo, if the student submitted one. */
  imagePath?: string | null;
  /** Sentence revisions from the feedback; null when there is no AI feedback. */
  revisions: SentenceRevision[] | null;
  /** Older feedback only corrected a few key sentences. */
  partial?: boolean;
  errorTags?: ErrorTag[];
  role: 'teacher' | 'student';
  /** Needed for the per-correction discussion. */
  feedbackId?: string;
  /** Comments for this feedback; fetched here when not provided. */
  comments?: FeedbackComment[];
  onRefreshComments?: () => void;
  /** Teacher editing: receives the whole updated list (ids included). Omit for read-only. */
  onChangeRevisions?: (next: SentenceRevision[]) => void;
  /** Teacher editing: remove an error label (error_tags row). */
  onRemoveTag?: (tagId: string) => void;
  /** Teacher editing: add an error label for a correction. */
  onAddTag?: (tag: {
    error_type: ErrorType;
    pattern_name: string;
    original_text: string;
    suggested_revision: string;
    explanation: string;
  }) => void;
  /** Teacher editing: change a label's type or name. */
  onUpdateTag?: (tagId: string, label: { error_type: ErrorType; pattern_name: string }) => void;
  /** Label names already used in this class, suggested when labelling. */
  labelSuggestions?: LabelSuggestion[];
  label?: string;
  className?: string;
}

/**
 * The student's composition with the corrections shown Word-style (track changes),
 * plus Original / Revised / Photo views, a details panel for the selected
 * correction, and the list of all corrections.
 */
export default function CompositionReview({
  text,
  imagePath,
  revisions,
  partial = false,
  errorTags = [],
  role,
  feedbackId,
  comments: commentsProp,
  onRefreshComments,
  onChangeRevisions,
  onRemoveTag,
  onAddTag,
  onUpdateTag,
  labelSuggestions,
  label = 'Composition',
  className = '',
}: Props) {
  const [chosenMode, setChosenMode] = useState<Mode | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [attachId, setAttachId] = useState<string | null>(null);
  // The list repeats what the essay shows, so it starts folded
  const [showList, setShowList] = useState(false);
  const [ownComments, setOwnComments] = useState<FeedbackComment[]>([]);
  const [commentsVersion, setCommentsVersion] = useState(0);

  // Comments: use the page's copy when it has one, otherwise load them here.
  useEffect(() => {
    if (!feedbackId || commentsProp) return;
    let cancelled = false;
    fetch(`/api/feedback/${feedbackId}/comments`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: FeedbackComment[]) => {
        if (!cancelled) setOwnComments(Array.isArray(data) ? data : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [feedbackId, commentsProp, commentsVersion]);
  const comments = commentsProp ?? ownComments;
  const refreshComments = onRefreshComments ?? (() => setCommentsVersion((v) => v + 1));

  const revs = useMemo(() => (revisions ? withRevisionIds(revisions) : null), [revisions]);
  const canEdit = role === 'teacher' && !!onChangeRevisions && !!revs;

  // The open draft previews live in the essay.
  const effective = useMemo((): Revision[] => {
    if (!revs) return [];
    if (!draft) return revs;
    if (draft.isNew) {
      return [
        ...revs,
        {
          id: draft.id,
          original: draft.original ?? '',
          revised: draft.revised,
          explanation: draft.explanation,
          start: draft.start,
          end: draft.end,
          source: 'teacher',
        },
      ];
    }
    return revs.map((r) =>
      r.id === draft.id
        ? {
            ...r,
            revised: draft.revised,
            explanation: draft.explanation,
            ...(draft.original !== undefined ? { original: draft.original, start: draft.start, end: draft.end } : {}),
          }
        : r
    );
  }, [revs, draft]);

  const placement = useMemo(() => placeRevisions(text, effective), [text, effective]);
  const ordered = useMemo(
    () => [...placement.placed.map((p) => p.rev), ...placement.unplaced.map((u) => u.rev)],
    [placement]
  );
  const numbers = useMemo(() => new Map(ordered.map((r, i) => [r.id, i + 1] as [string, number])), [ordered]);
  const placedById = useMemo(() => new Map(placement.placed.map((p) => [p.rev.id, p])), [placement]);

  // Error labels (error_tags) belong to the correction that fixes them
  const tagLinks = useMemo(() => linkTags(text, placement, errorTags), [text, placement, errorTags]);
  const tagsFor = (id: string): TagChip[] => errorTags.filter((t) => tagLinks.get(t.id) === id);
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of errorTags) if (tagLinks.has(t.id)) counts[t.error_type] = (counts[t.error_type] ?? 0) + 1;
    return counts;
  }, [errorTags, tagLinks]);

  // Which views are available, and which one is showing
  const modes: Mode[] = [...(revs ? (['track'] as Mode[]) : []), 'original', ...(revs ? (['revised'] as Mode[]) : []), ...(imagePath ? (['photo'] as Mode[]) : [])];
  const mode: Mode = chosenMode && modes.includes(chosenMode) ? chosenMode : revs ? 'track' : 'original';

  const active = ordered.find((r) => r.id === activeId) ?? null;

  /** The list with the open draft applied (unchanged list when there is nothing to save). */
  function applyDraft(list: Revision[]): Revision[] {
    const d = draft;
    if (!d) return list;
    if (d.isNew) {
      const unchanged = d.revised.trim() === (d.original ?? '').trim() && !d.explanation.trim();
      if (unchanged) return list;
      return [
        ...list,
        {
          id: d.id,
          original: d.original ?? '',
          revised: d.revised,
          explanation: d.explanation,
          start: d.start,
          end: d.end,
          source: 'teacher',
        },
      ];
    }
    if (d.revised === d.baseRevised && d.explanation === d.baseExplanation) return list;
    return list.map((r) =>
      r.id === d.id
        ? {
            ...r,
            revised: d.revised,
            explanation: d.explanation,
            ...(d.original !== undefined ? { original: d.original, start: d.start, end: d.end } : {}),
          }
        : r
    );
  }

  function commitDraft() {
    if (draft && revs && onChangeRevisions) {
      const next = applyDraft(revs);
      if (next !== revs) onChangeRevisions(next);
      else if (draft.isNew) setActiveId((cur) => (cur === draft.id ? null : cur));
    }
    setDraft(null);
  }

  function cancelDraft() {
    if (draft?.isNew) setActiveId(null);
    setDraft(null);
  }

  function activate(id: string) {
    if (draft && draft.id !== id) commitDraft();
    setActiveId(id);
    if (mode === 'original' || mode === 'photo') setChosenMode('track');
  }

  function scrollToMark(id: string) {
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-rev="${id}"]`) ?? document.getElementById('unmatched-corrections');
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }

  function step(delta: number) {
    if (!ordered.length) return;
    const i = active ? ordered.findIndex((r) => r.id === active.id) : -1;
    const next = ordered[(i + delta + ordered.length) % ordered.length];
    activate(next.id);
    scrollToMark(next.id);
  }

  function startEdit() {
    if (!active) return;
    const p = placedById.get(active.id);
    const revised = p ? p.revised : active.revised;
    setDraft({
      id: active.id,
      revised,
      explanation: active.explanation,
      isNew: false,
      baseRevised: revised,
      baseExplanation: active.explanation,
      ...(p ? { original: text.slice(p.start, p.end), start: p.start, end: p.end } : {}),
    });
  }

  function deleteActive() {
    if (!active || !revs || !onChangeRevisions) return;
    const id = active.id;
    setDraft(null);
    setActiveId(null);
    if (revs.some((r) => r.id === id)) onChangeRevisions(revs.filter((r) => r.id !== id));
  }

  function addAt(start: number, end: number) {
    if (!revs || !onChangeRevisions) return;
    const words = text.slice(start, end);
    const list = applyDraft(revs);
    if (attachId) {
      const id = attachId;
      onChangeRevisions(
        list.map((r) =>
          r.id === id ? { ...r, original: words, revised: rebaseRevision(r.original, r.revised, words), start, end } : r
        )
      );
      setAttachId(null);
      setDraft(null);
      setActiveId(id);
      return;
    }
    if (list !== revs) onChangeRevisions(list);
    const id = newRevisionId();
    setActiveId(id);
    setDraft({ id, revised: words, explanation: '', isNew: true, original: words, start, end });
    setChosenMode('track');
  }

  /** Teacher clicked an unmarked sentence: open the correction editor for it. */
  function pickSentence(start: number, end: number) {
    let s = start;
    let e = end;
    while (s < e && /\s/.test(text[s])) s++;
    while (e > s && /\s/.test(text[e - 1])) e--;
    if (s >= e) return;
    // In the Original view a sentence may already have a correction: open that one
    const existing = placement.placed.find((p) => s < p.end && p.start < e);
    if (existing && !attachId) {
      activate(existing.rev.id);
      return;
    }
    addAt(s, e);
  }

  // A label in the Characters / Vocabulary / Grammar sections asks to open its correction
  const focusHandler = useRef<(id: string) => void>(() => {});
  useEffect(() => {
    focusHandler.current = (id: string) => {
      if (!ordered.some((r) => r.id === id)) return;
      activate(id);
      scrollToMark(id);
    };
  });
  useEffect(() => onFocusCorrection((id) => focusHandler.current(id)), []);

  function discussionFor(rev: Revision) {
    if (!feedbackId) return { node: null, count: 0 };
    const key = commentKeyFor(rev);
    const thread = comments.filter((c) => c.section === key);
    if (role === 'teacher') {
      // Teachers reply to student questions; nothing to show until a student asks.
      return {
        node: thread.length ? (
          <TeacherCommentThread feedbackId={feedbackId} section={key} comments={comments} onRefresh={refreshComments} />
        ) : null,
        count: thread.length,
      };
    }
    return {
      node: <CommentThread feedbackId={feedbackId} section={key} comments={thread} onRefresh={refreshComments} />,
      count: thread.length,
    };
  }

  const inspector = (slot: string) => {
    if (!active) return null;
    const discussion = discussionFor(active);
    const placedActive = placedById.get(active.id);
    return (
      <RevisionInspector
        key={active.id}
        slot={slot}
        item={active}
        ops={placedById.get(active.id)?.ops ?? null}
        n={numbers.get(active.id) ?? 0}
        total={ordered.length}
        canEdit={canEdit}
        tags={tagsFor(active.id)}
        draft={draft}
        discussion={discussion.node}
        discussionCount={discussion.count}
        onPrev={() => step(-1)}
        onNext={() => step(1)}
        onClose={() => {
          commitDraft();
          setActiveId(null);
        }}
        onEdit={startEdit}
        onDraft={setDraft}
        onDone={commitDraft}
        onCancel={cancelDraft}
        onDelete={deleteActive}
        onAttach={() => {
          setAttachId(active.id);
          setChosenMode('track');
        }}
        onRemoveTag={canEdit ? onRemoveTag : undefined}
        onAddTag={
          canEdit && onAddTag
            ? (lbl) =>
                onAddTag({
                  ...lbl,
                  original_text: placedActive ? text.slice(placedActive.start, placedActive.end) : active.original,
                  suggested_revision: placedActive ? placedActive.revised : active.revised,
                  explanation: active.explanation,
                })
            : undefined
        }
        onUpdateTag={canEdit ? onUpdateTag : undefined}
        labelSuggestions={labelSuggestions}
      />
    );
  };

  const overview = (
    <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm shadow-sm">
      {mode === 'original' || !revs ? (
        <p className="leading-relaxed text-gray-600">
          {revs ? (
            <>
              This is exactly what the student submitted. Switch to{' '}
              <b className="font-medium text-gray-900">Track changes</b> to see the corrections.
            </>
          ) : (
            'No AI corrections for this composition.'
          )}
        </p>
      ) : ordered.length === 0 ? (
        <p className="leading-relaxed text-gray-600">No corrections — the AI found nothing to fix at this level.</p>
      ) : (
        <>
          <p className="font-medium text-gray-900">
            {ordered.length} correction{ordered.length === 1 ? '' : 's'}
          </p>
          {Object.keys(typeCounts).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(typeCounts).map(([type, count]) => (
                <TypeChip key={type} tag={{ error_type: type, pattern_name: '' }} count={count} />
              ))}
            </div>
          )}
          <p className="mt-3 leading-relaxed text-gray-600">Click a marked sentence to see what changed and why.</p>
          <button
            type="button"
            onClick={() => step(1)}
            className="mt-3 w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Review one by one
          </button>
        </>
      )}
      {canEdit && (
        <p className="mt-3 border-t border-gray-100 pt-3 text-xs leading-relaxed text-gray-500">
          Missed an error? Click any sentence to correct it, or select a few words for a smaller correction.
        </p>
      )}
    </div>
  );

  const showUnmatched = canEdit && placement.unplaced.length > 0 && mode !== 'original' && mode !== 'photo';

  return (
    <div className={className}>
      <div className="rounded-lg bg-gray-50 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <h3 className="text-sm font-medium text-gray-500">{label}</h3>
            <span className="text-xs text-gray-400">{text.replace(/\s/g, '').length} characters</span>
          </div>
          {modes.length > 1 && (
            <div role="tablist" aria-label="Composition view" className="inline-flex flex-wrap rounded-md bg-gray-200/70 p-0.5 text-xs">
              {modes.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => {
                    setChosenMode(m);
                    setAttachId(null);
                  }}
                  className={`rounded px-2.5 py-1 ${
                    mode === m ? 'bg-white font-medium text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {MODE_LABELS[m]}
                </button>
              ))}
            </div>
          )}
        </div>

        {mode === 'photo' && imagePath ? (
          <CompositionPhoto key={imagePath} path={imagePath} />
        ) : (
          <div className={revs ? 'grid gap-5 lg:grid-cols-[minmax(0,1fr)_17.5rem]' : ''}>
            <div className="min-w-0">
              {partial && mode === 'track' && (
                <p className="mb-3 rounded-md bg-white px-3 py-2 text-xs leading-relaxed text-gray-500 ring-1 ring-inset ring-gray-200">
                  This feedback was generated before full-text corrections, so only a few key sentences are marked.
                </p>
              )}
              {attachId && (
                <div className="mb-3 flex items-center justify-between gap-3 rounded-md bg-gray-900 px-3 py-2 text-xs text-white">
                  <span>
                    Click the sentence (or select the words) that correction {numbers.get(attachId)} belongs to.
                  </span>
                  <button type="button" onClick={() => setAttachId(null)} className="shrink-0 text-gray-300 hover:text-white">
                    Cancel
                  </button>
                </div>
              )}
              <TrackChangesView
                text={text}
                placement={placement}
                numbers={numbers}
                mode={mode === 'photo' ? 'original' : mode}
                activeId={activeId}
                onActivate={activate}
                onSelectRange={canEdit ? addAt : undefined}
                selectLabel={attachId ? `Attach correction ${numbers.get(attachId)} here` : '+ Add correction'}
                onPickSentence={canEdit ? pickSentence : undefined}
              />
              {mode === 'track' && ordered.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-500">
                  <span>
                    <del className={DEL_CLASS}>删除</del> removed
                  </span>
                  <span>
                    <ins className={INS_CLASS}>添加</ins> added
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <NumberBadge n={1} raised={false} /> AI correction
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <NumberBadge n={2} teacher raised={false} /> added by teacher
                  </span>
                </div>
              )}
              {showUnmatched && (
                <div id="unmatched-corrections" className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-medium text-amber-900">
                    {placement.unplaced.length === 1
                      ? "1 correction couldn't be matched to the text"
                      : `${placement.unplaced.length} corrections couldn't be matched to the text`}
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {placement.unplaced.map((u) => (
                      <li key={u.rev.id}>
                        <button
                          type="button"
                          onClick={() => activate(u.rev.id)}
                          className={`flex w-full items-start gap-2 rounded px-1.5 py-1 text-left text-sm hover:bg-amber-100 ${
                            activeId === u.rev.id ? 'bg-amber-100' : ''
                          }`}
                        >
                          <span className="pt-1">
                            <NumberBadge n={numbers.get(u.rev.id) ?? 0} raised={false} />
                          </span>
                          <span className="min-w-0 text-gray-700">
                            {u.rev.original} <span className="text-gray-400">&rarr;</span> {u.rev.revised}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            {revs && (
              <aside className="hidden lg:block">
                <div className="sticky top-20">{inspector('side') ?? overview}</div>
              </aside>
            )}
          </div>
        )}
      </div>

      {revs && ordered.length > 0 && (
        <section className="mt-4">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-gray-700">All corrections ({ordered.length})</h4>
            <button
              type="button"
              aria-expanded={showList}
              onClick={() => setShowList((v) => !v)}
              className="text-xs text-blue-600 hover:underline"
            >
              {showList ? 'Hide list' : 'Show as a list'}
            </button>
          </div>
          {showList && (
          <ol className="mt-2 space-y-2">
            {ordered.map((r) => {
              const p = placedById.get(r.id);
              const commentCount = feedbackId ? comments.filter((c) => c.section === commentKeyFor(r)).length : 0;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => {
                      activate(r.id);
                      scrollToMark(r.id);
                    }}
                    className={`flex w-full gap-2.5 rounded-lg border p-3 text-left transition-colors ${
                      activeId === r.id ? 'border-blue-300 bg-blue-50' : 'border-gray-100 bg-gray-50 hover:bg-gray-100'
                    }`}
                  >
                    <span className="pt-1">
                      <NumberBadge n={numbers.get(r.id) ?? 0} teacher={r.source === 'teacher'} raised={false} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block leading-7 text-gray-800">
                        {p ? <DiffOps ops={p.ops} /> : `${r.original} → ${r.revised}`}
                      </span>
                      {r.explanation && (
                        <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-gray-500">
                          {r.explanation}
                        </span>
                      )}
                    </span>
                    {commentCount > 0 && (
                      <span className="shrink-0 self-start rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                        {commentCount} comment{commentCount === 1 ? '' : 's'}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
          )}
        </section>
      )}

      {active && mode !== 'photo' && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 max-h-[72vh] overflow-y-auto rounded-t-2xl border-t border-gray-200 bg-gray-100 px-3 pt-2 shadow-[0_-8px_30px_rgba(0,0,0,0.15)] lg:hidden"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-gray-300" />
          {inspector('sheet')}
        </div>
      )}
    </div>
  );
}
