import type { TagChip } from '@/components/LabelControls';
import { canonicalPatternName, errorTypeFor } from './error-taxonomy';
import type { DeleteReason } from './error-taxonomy';
import type { LabelFields } from './tag-edits';

/**
 * Label changes made while a correction is open for editing. They wait in the
 * draft and reach the page's label edits only when the teacher clicks Done, so
 * Cancel leaves the labels as they were, and a new correction gets its labels
 * together with the correction itself.
 */
export interface DraftLabels {
  /** New labels (temporary ids start with "draft-"). */
  added: { id: string; fields: LabelFields }[];
  /** Existing labels the teacher changed. */
  updated: Record<string, LabelFields>;
  /** Existing labels the teacher removed, with the optional reason. */
  removed: Record<string, DeleteReason | null>;
  /** AI labels the teacher kept as they are. */
  confirmed: string[];
}

export const emptyDraftLabels = (): DraftLabels => ({ added: [], updated: {}, removed: {}, confirmed: [] });

export const isDraftLabelId = (id: string) => id.startsWith('draft-');

export function hasDraftLabels(d: DraftLabels | null | undefined): d is DraftLabels {
  return (
    !!d &&
    (d.added.length > 0 || Object.keys(d.updated).length > 0 || Object.keys(d.removed).length > 0 || d.confirmed.length > 0)
  );
}

export function draftAddLabel(d: DraftLabels, fields: LabelFields): DraftLabels {
  const id = `draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  return { ...d, added: [...d.added, { id, fields }] };
}

export function draftUpdateLabel(d: DraftLabels, id: string, fields: LabelFields): DraftLabels {
  if (isDraftLabelId(id)) return { ...d, added: d.added.map((a) => (a.id === id ? { ...a, fields } : a)) };
  return { ...d, updated: { ...d.updated, [id]: fields }, confirmed: d.confirmed.filter((x) => x !== id) };
}

export function draftRemoveLabel(d: DraftLabels, id: string, reason: DeleteReason | null): DraftLabels {
  if (isDraftLabelId(id)) return { ...d, added: d.added.filter((a) => a.id !== id) };
  const { [id]: _dropped, ...updated } = d.updated;
  void _dropped;
  return {
    ...d,
    updated,
    removed: { ...d.removed, [id]: reason },
    confirmed: d.confirmed.filter((x) => x !== id),
  };
}

export function draftConfirmLabel(d: DraftLabels, id: string): DraftLabels {
  if (isDraftLabelId(id) || d.confirmed.includes(id) || id in d.removed) return d;
  return { ...d, confirmed: [...d.confirmed, id] };
}

/** The open correction's labels as they look with the draft's changes. */
export function withDraftLabels(tags: TagChip[], d: DraftLabels | null | undefined): TagChip[] {
  if (!hasDraftLabels(d)) return tags;
  const kept = tags
    .filter((t) => !(t.id && t.id in d.removed))
    .map((t): TagChip => {
      const fields = t.id ? d.updated[t.id] : undefined;
      if (fields) {
        return {
          ...t,
          ...fields,
          error_type: errorTypeFor(fields.code),
          pattern_name: canonicalPatternName(fields),
          status: t.source === 'teacher' || t.status === 'added' ? 'added' : 'modified',
        };
      }
      if (t.id && d.confirmed.includes(t.id) && t.status === 'suggested') return { ...t, status: 'confirmed' };
      return t;
    });
  const added = d.added.map(
    (a): TagChip => ({
      id: a.id,
      ...a.fields,
      error_type: errorTypeFor(a.fields.code),
      pattern_name: canonicalPatternName(a.fields),
      status: 'added',
      source: 'teacher',
    })
  );
  return [...kept, ...added];
}
