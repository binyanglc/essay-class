'use client';

import { focusCorrection } from '@/lib/correction-links';
import type { CorrectionLink } from '@/lib/correction-links';
import type { ErrorTag } from '@/types';
import { NumberBadge } from './TrackChangesView';

/**
 * The error labels of one category (Characters / Vocabulary / Grammar).
 * A label that belongs to a correction links to it in the composition;
 * the rest are shown as small cards.
 */
export default function ErrorLabels({
  tags,
  links,
  onRemove,
}: {
  tags: ErrorTag[];
  links: Map<string, CorrectionLink>;
  /** Teacher only. */
  onRemove?: (tagId: string) => void;
}) {
  if (tags.length === 0) return null;
  const linked = tags
    .filter((t) => links.has(t.id))
    .sort((a, b) => (links.get(a.id)?.n ?? 0) - (links.get(b.id)?.n ?? 0));
  const unlinked = tags.filter((t) => !links.has(t.id));

  return (
    <div className="mt-2 space-y-2">
      {linked.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {linked.map((t) => {
            const link = links.get(t.id)!;
            return (
              <span
                key={t.id}
                className="inline-flex items-center rounded-full bg-gray-100 text-xs text-gray-700 ring-1 ring-inset ring-gray-200"
              >
                <button
                  type="button"
                  onClick={() => focusCorrection(link.revisionId)}
                  title="Show this correction in the composition"
                  className="inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 hover:bg-gray-200"
                >
                  <NumberBadge n={link.n} raised={false} />
                  {t.pattern_name || t.error_type}
                </button>
                {onRemove && (
                  <button
                    type="button"
                    aria-label={`Remove label ${t.pattern_name || t.error_type}`}
                    title="Remove this label"
                    onClick={() => onRemove(t.id)}
                    className="-ml-1 rounded-full px-2 py-1 text-gray-400 hover:text-red-600"
                  >
                    &times;
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}
      {unlinked.map((t) => (
        <div key={t.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs font-medium text-blue-600">{t.pattern_name || t.error_type}</span>
            {onRemove && (
              <button type="button" onClick={() => onRemove(t.id)} className="text-xs text-red-500 hover:underline">
                Remove
              </button>
            )}
          </div>
          <div className="mt-1 text-sm">
            <span className="text-red-600 line-through">{t.original_text}</span>
            <span className="ml-2 text-green-700">&rarr; {t.suggested_revision}</span>
          </div>
          {t.explanation && <p className="mt-1 text-xs text-gray-500">{t.explanation}</p>}
        </div>
      ))}
    </div>
  );
}
