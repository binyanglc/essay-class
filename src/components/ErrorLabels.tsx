'use client';

import { useState } from 'react';
import { focusCorrection } from '@/lib/correction-links';
import type { CorrectionLink } from '@/lib/correction-links';
import { NATURE_LABELS, isUnconfirmedAi, tagLabel } from '@/lib/error-taxonomy';
import type { DeleteReason, Nature } from '@/lib/error-taxonomy';
import type { ErrorTag } from '@/types';
import { NumberBadge } from './TrackChangesView';
import { RemoveReasonPrompt } from './LabelControls';

/** Small marks after a label's name: AI suggestion not checked yet, not an error. */
function Marks({ tag }: { tag: ErrorTag }) {
  return (
    <>
      {isUnconfirmedAi(tag) && (
        <span
          title="AI suggestion — not yet checked by the teacher"
          className="rounded bg-white px-1 text-[9px] font-semibold uppercase tracking-wide text-gray-500 ring-1 ring-inset ring-gray-200"
        >
          AI
        </span>
      )}
      {tag.nature && tag.nature !== 'error' && (
        <span className="text-[10px] text-gray-500">({NATURE_LABELS[tag.nature as Nature]})</span>
      )}
    </>
  );
}

/**
 * The error labels of one category (Characters / Vocabulary / Grammar / …).
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
  /** Teacher only (the reason is optional). */
  onRemove?: (tagId: string, reason: DeleteReason | null) => void;
}) {
  const [removingId, setRemovingId] = useState<string | null>(null);
  const removing = tags.find((t) => t.id === removingId) ?? null;
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
            const unchecked = isUnconfirmedAi(t);
            return (
              <span
                key={t.id}
                className={`inline-flex items-center rounded-full bg-gray-100 text-xs text-gray-700 ${
                  unchecked ? 'border border-dashed border-gray-300' : 'ring-1 ring-inset ring-gray-200'
                }`}
              >
                <button
                  type="button"
                  onClick={() => focusCorrection(link.revisionId)}
                  title={
                    onRemove
                      ? 'Open this correction — you can change the label there'
                      : 'Show this correction in the composition'
                  }
                  className="inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 hover:bg-gray-200"
                >
                  <NumberBadge n={link.n} raised={false} />
                  {tagLabel(t)}
                  <Marks tag={t} />
                </button>
                {onRemove && (
                  <button
                    type="button"
                    aria-label={`Remove label ${tagLabel(t)}`}
                    title="Remove this label"
                    onClick={() => setRemovingId(t.id)}
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
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600">
              {tagLabel(t)}
              <Marks tag={t} />
            </span>
            {onRemove && (
              <button type="button" onClick={() => setRemovingId(t.id)} className="text-xs text-red-500 hover:underline">
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
      {onRemove && removing && (
        <RemoveReasonPrompt
          name={tagLabel(removing)}
          onChoose={(reason) => {
            onRemove(removing.id, reason);
            setRemovingId(null);
          }}
          onCancel={() => setRemovingId(null)}
        />
      )}
    </div>
  );
}

/** Label groups that have no AI comment of their own: shown only when there are labels. */
export const EXTRA_LABEL_TYPES = ['punctuation', 'discourse', 'register', 'expression'] as const;

const EXTRA_TITLES: Record<(typeof EXTRA_LABEL_TYPES)[number], string> = {
  punctuation: 'Punctuation',
  discourse: 'Linking & Flow',
  register: 'Register & Tone',
  expression: 'Natural Expression',
};

/** Punctuation / linking / register / natural-expression labels, one small section each. */
export function ExtraLabelSections({
  tags,
  links,
  onRemove,
}: {
  tags: ErrorTag[];
  links: Map<string, CorrectionLink>;
  onRemove?: (tagId: string, reason: DeleteReason | null) => void;
}) {
  return (
    <>
      {EXTRA_LABEL_TYPES.map((type) => {
        const list = tags.filter((t) => t.error_type === type);
        if (list.length === 0) return null;
        return (
          <section key={type}>
            <h4 className="text-sm font-semibold text-gray-700">{EXTRA_TITLES[type]}</h4>
            <ErrorLabels tags={list} links={links} onRemove={onRemove} />
          </section>
        );
      })}
    </>
  );
}
