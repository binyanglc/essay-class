import type { ErrorTag } from '@/types';
import { TAXONOMY_VERSION, canonicalPatternName, errorTypeFor, operationFor } from './error-taxonomy';
import type { DeleteReason, Nature } from './error-taxonomy';

/**
 * Unsaved changes to a submission's error labels (error_tags). They are
 * applied together with the other feedback edits when the teacher saves.
 */

/** What the teacher chooses for a label. */
export interface LabelFields {
  code: string;
  rule: string | null;
  item_target: string | null;
  item_learner: string | null;
  nature: Nature;
  /** The teacher's own wording (optional). */
  custom_label: string | null;
}

export interface NewTag extends LabelFields {
  /** Temporary id, starts with "new-". */
  id: string;
  original_text: string;
  suggested_revision: string;
  explanation: string;
  /** The correction it belongs to. */
  revision_id: string | null;
}

export interface TagEdits {
  deleted: string[];
  /** Optional reason the teacher gave for removing a label. */
  deleteReasons: Record<string, DeleteReason>;
  updated: Record<string, Partial<LabelFields> & { suggested_revision?: string }>;
  /** AI labels the teacher checked and kept as they are. */
  confirmed: string[];
  added: NewTag[];
}

export const LABEL_FIELD_NAMES: (keyof LabelFields)[] = [
  'code',
  'rule',
  'item_target',
  'item_learner',
  'nature',
  'custom_label',
];

export const emptyTagEdits = (): TagEdits => ({ deleted: [], deleteReasons: {}, updated: {}, confirmed: [], added: [] });

const isNew = (id: string) => id.startsWith('new-');

export function isTagEditsEmpty(e: TagEdits | null): boolean {
  return (
    !e ||
    (e.deleted.length === 0 && e.added.length === 0 && e.confirmed.length === 0 && Object.keys(e.updated).length === 0)
  );
}

/** True when a change touches the label itself (not just the example sentence). */
export function changesLabel(patch: Partial<LabelFields> | undefined): boolean {
  return !!patch && LABEL_FIELD_NAMES.some((k) => k in patch);
}

export function addTag(e: TagEdits, tag: Omit<NewTag, 'id'>): TagEdits {
  const id = `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  return { ...e, added: [...e.added, { ...tag, id }] };
}

export function removeTag(e: TagEdits, id: string, reason?: DeleteReason | null): TagEdits {
  if (isNew(id)) return { ...e, added: e.added.filter((t) => t.id !== id) };
  const { [id]: _dropped, ...updated } = e.updated;
  void _dropped;
  const deleteReasons = { ...e.deleteReasons };
  if (reason) deleteReasons[id] = reason;
  else delete deleteReasons[id];
  return {
    ...e,
    deleted: e.deleted.includes(id) ? e.deleted : [...e.deleted, id],
    deleteReasons,
    updated,
    confirmed: e.confirmed.filter((x) => x !== id),
  };
}

export function updateTag(e: TagEdits, id: string, patch: TagEdits['updated'][string]): TagEdits {
  if (isNew(id)) return { ...e, added: e.added.map((t) => (t.id === id ? { ...t, ...patch } : t)) };
  return { ...e, updated: { ...e.updated, [id]: { ...e.updated[id], ...patch } } };
}

export function confirmTags(e: TagEdits, ids: string[]): TagEdits {
  const add = ids.filter((id) => !isNew(id) && !e.confirmed.includes(id) && !e.deleted.includes(id));
  return add.length ? { ...e, confirmed: [...e.confirmed, ...add] } : e;
}

/** The labels as the teacher currently sees them (removed ones are gone, checked ones marked). */
export function applyTagEdits(
  tags: ErrorTag[],
  e: TagEdits | null,
  owner: { submission_id: string; student_id: string }
): ErrorTag[] {
  if (!e) return tags;
  const kept = tags
    .filter((t) => !e.deleted.includes(t.id))
    .map((t): ErrorTag => {
      const patch = e.updated[t.id];
      let next: ErrorTag = patch ? { ...t, ...patch } : t;
      if (changesLabel(patch) && next.code) {
        next = {
          ...next,
          error_type: errorTypeFor(next.code!),
          pattern_name: canonicalPatternName(next),
          status: t.source === 'teacher' || t.status === 'added' ? 'added' : 'modified',
        };
      } else if (e.confirmed.includes(t.id) && t.status === 'suggested') {
        next = { ...next, status: 'confirmed' };
      }
      return next;
    });
  const added = e.added.map(
    (t): ErrorTag => ({
      ...t,
      ...owner,
      error_type: errorTypeFor(t.code),
      pattern_name: canonicalPatternName(t),
      improvement_tip: '',
      sentence_index: null,
      created_at: '',
      operation: operationFor(t.item_learner, t.item_target),
      source: 'teacher',
      status: 'added',
      taxonomy_version: TAXONOMY_VERSION,
    })
  );
  return [...kept, ...added];
}
