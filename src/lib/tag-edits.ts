import type { ErrorTag, ErrorType } from '@/types';

/**
 * Unsaved changes to a submission's error labels (error_tags). They are
 * applied together with the other feedback edits when the teacher saves.
 */

export interface LabelFields {
  error_type: ErrorType;
  pattern_name: string;
}

export interface NewTag extends LabelFields {
  /** Temporary id, starts with "new-". */
  id: string;
  original_text: string;
  suggested_revision: string;
  explanation: string;
}

export interface TagEdits {
  deleted: string[];
  updated: Record<string, Partial<LabelFields> & { suggested_revision?: string }>;
  added: NewTag[];
}

export const emptyTagEdits = (): TagEdits => ({ deleted: [], updated: {}, added: [] });

const isNew = (id: string) => id.startsWith('new-');

export function isTagEditsEmpty(e: TagEdits | null): boolean {
  return !e || (e.deleted.length === 0 && e.added.length === 0 && Object.keys(e.updated).length === 0);
}

export function addTag(e: TagEdits, tag: Omit<NewTag, 'id'>): TagEdits {
  const id = `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  return { ...e, added: [...e.added, { ...tag, id }] };
}

export function removeTag(e: TagEdits, id: string): TagEdits {
  if (isNew(id)) return { ...e, added: e.added.filter((t) => t.id !== id) };
  if (e.deleted.includes(id)) return e;
  const { [id]: _dropped, ...updated } = e.updated;
  void _dropped;
  return { ...e, deleted: [...e.deleted, id], updated };
}

export function updateTag(e: TagEdits, id: string, patch: TagEdits['updated'][string]): TagEdits {
  if (isNew(id)) return { ...e, added: e.added.map((t) => (t.id === id ? { ...t, ...patch } : t)) };
  return { ...e, updated: { ...e.updated, [id]: { ...e.updated[id], ...patch } } };
}

/** The labels as the teacher currently sees them. */
export function applyTagEdits(
  tags: ErrorTag[],
  e: TagEdits | null,
  owner: { submission_id: string; student_id: string }
): ErrorTag[] {
  if (!e) return tags;
  return [
    ...tags.filter((t) => !e.deleted.includes(t.id)).map((t) => (e.updated[t.id] ? { ...t, ...e.updated[t.id] } : t)),
    ...e.added.map(
      (t) =>
        ({
          ...t,
          ...owner,
          improvement_tip: '',
          sentence_index: null,
          created_at: '',
        }) as ErrorTag
    ),
  ];
}
