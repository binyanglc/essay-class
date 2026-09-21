import type { SentenceRevision } from '@/types';
import { placeRevisions } from './track-changes';

/** A sentence revision that is guaranteed to have an id. */
export type Revision = SentenceRevision & { id: string };

/** Short random id for a new sentence revision. */
export function newRevisionId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Older feedback has no revision ids. Give each one a deterministic id and keep
 * the index-based comment key it was created with ("sentence_2"), so existing
 * discussions stay attached even after the list is edited or reordered.
 */
export function withRevisionIds(revisions: SentenceRevision[] | null | undefined): Revision[] {
  return (revisions ?? []).map((r, i) =>
    r.id ? (r as Revision) : { ...r, id: `s${i}`, commentKey: r.commentKey ?? `sentence_${i}` }
  );
}

/** Comment section key for a revision's discussion thread. */
export function commentKeyFor(rev: Revision): string {
  return rev.commentKey ?? `sentence_${rev.id}`;
}

/** Validates sentence revisions coming from a client before they are stored. */
export function sanitizeRevisions(input: unknown): SentenceRevision[] | null {
  if (!Array.isArray(input)) return null;
  const out: SentenceRevision[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const rev: SentenceRevision = {
      original: typeof o.original === 'string' ? o.original : '',
      revised: typeof o.revised === 'string' ? o.revised : '',
      explanation: typeof o.explanation === 'string' ? o.explanation : '',
    };
    if (typeof o.id === 'string' && o.id) rev.id = o.id.slice(0, 40);
    if (Number.isInteger(o.start) && Number.isInteger(o.end)) {
      rev.start = o.start as number;
      rev.end = o.end as number;
    }
    if (o.source === 'ai' || o.source === 'teacher') rev.source = o.source;
    if (typeof o.commentKey === 'string' && o.commentKey) rev.commentKey = o.commentKey.slice(0, 60);
    out.push(rev);
  }
  return out;
}

/**
 * Prepares the AI's sentence revisions for storage: drops items that change
 * nothing, gives each a stable id, and anchors it to the student's own words
 * (exact text + offsets) so every view can place it without guessing.
 */
export function anchorRevisions(text: string, input: unknown): SentenceRevision[] {
  const items: Revision[] = (sanitizeRevisions(input) ?? [])
    .filter((r) => r.original.trim() && r.original.trim() !== r.revised.trim())
    .map((r) => ({ ...r, id: newRevisionId(), source: 'ai' as const }));
  const { placed } = placeRevisions(text, items);
  const byId = new Map(placed.map((p) => [p.rev.id, p]));
  const out: SentenceRevision[] = [];
  for (const r of items) {
    const p = byId.get(r.id);
    if (!p) {
      out.push(r); // kept; the teacher can attach or delete it
      continue;
    }
    const actual = text.slice(p.start, p.end);
    if (p.revised === actual) continue; // the only "change" was the AI misquoting the student
    out.push({ ...r, original: actual, revised: p.revised, start: p.start, end: p.end });
  }
  return out;
}
