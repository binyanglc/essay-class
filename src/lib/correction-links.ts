import { containsLoosely, placeRevisions } from './track-changes';
import type { Placement } from './track-changes';
import { withRevisionIds } from './revisions';
import type { Revision } from './revisions';
import type { SentenceRevision } from '@/types';

/**
 * Error labels (error_tags: "了 usage", "Sentence structure"…) belong to the
 * correction in the composition that fixes them. The link is by text: the
 * correction's words contain the label's words (or the other way round).
 */

export interface CorrectionLink {
  revisionId: string;
  /** The correction's number in the composition. */
  n: number;
}

interface TagLike {
  id: string;
  original_text: string;
}

/** Correction numbers in reading order (placed ones first, then the ones that couldn't be placed). */
export function numberCorrections(placement: Placement<Revision>): Map<string, number> {
  const ordered = [...placement.placed.map((p) => p.rev), ...placement.unplaced.map((u) => u.rev)];
  return new Map(ordered.map((r, i) => [r.id, i + 1] as [string, number]));
}

/** Tag id → id of the correction it belongs to. */
export function linkTags(text: string, placement: Placement<Revision>, tags: TagLike[]): Map<string, string> {
  const links = new Map<string, string>();
  for (const tag of tags) {
    if (!tag.original_text) continue;
    const hit =
      placement.placed.find((p) => containsLoosely(text.slice(p.start, p.end), tag.original_text)) ??
      placement.placed.find((p) => containsLoosely(tag.original_text, text.slice(p.start, p.end)));
    if (hit) links.set(tag.id, hit.rev.id);
  }
  return links;
}

/** Tag id → the correction it belongs to, with that correction's number. */
export function linkTagsToCorrections(
  text: string,
  revisions: SentenceRevision[] | null | undefined,
  tags: TagLike[]
): Map<string, CorrectionLink> {
  const out = new Map<string, CorrectionLink>();
  if (!revisions) return out;
  const placement = placeRevisions(text, withRevisionIds(revisions));
  const numbers = numberCorrections(placement);
  for (const [tagId, revisionId] of linkTags(text, placement, tags)) {
    out.set(tagId, { revisionId, n: numbers.get(revisionId) ?? 0 });
  }
  return out;
}

/**
 * What a change to the corrections means for the labels. Labels belong to
 * corrections: when a correction is deleted its labels go too, and a label
 * that describes the whole sentence follows the teacher's new suggestion.
 */
export function labelChangesFor(
  text: string,
  before: SentenceRevision[],
  after: SentenceRevision[],
  tags: TagLike[]
): { deleted: string[]; updated: Record<string, string> } {
  const prev = withRevisionIds(before);
  const next = withRevisionIds(after);
  const links = linkTagsToCorrections(text, prev, tags);
  const deleted: string[] = [];
  const updated: Record<string, string> = {};
  for (const tag of tags) {
    const link = links.get(tag.id);
    if (!link) continue;
    const was = prev.find((r) => r.id === link.revisionId);
    const now = next.find((r) => r.id === link.revisionId);
    if (!now) {
      deleted.push(tag.id);
    } else if (
      was &&
      was.revised !== now.revised &&
      containsLoosely(tag.original_text, now.original) &&
      containsLoosely(now.original, tag.original_text)
    ) {
      updated[tag.id] = now.revised;
    }
  }
  return { deleted, updated };
}

const FOCUS_EVENT = 'aixie:focus-correction';

/** Asks the composition view on the page to open a correction. */
export function focusCorrection(revisionId: string) {
  window.dispatchEvent(new CustomEvent<string>(FOCUS_EVENT, { detail: revisionId }));
}

export function onFocusCorrection(handler: (revisionId: string) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<string>).detail);
  window.addEventListener(FOCUS_EVENT, listener);
  return () => window.removeEventListener(FOCUS_EVENT, listener);
}
