'use client';

import type { ReactNode } from 'react';
import type { DiffOp } from '@/lib/track-changes';
import type { Revision } from '@/lib/revisions';
import { DiffOps, NumberBadge } from './TrackChangesView';

export interface TagChip {
  error_type: string;
  pattern_name: string;
}

/** A correction being edited by the teacher (previewed live in the essay). */
export interface Draft {
  id: string;
  revised: string;
  explanation: string;
  isNew: boolean;
  /** Anchor captured when editing starts, so the preview diffs against the student's own words. */
  original?: string;
  start?: number;
  end?: number;
  /** Values when editing started — unchanged drafts are not saved. */
  baseRevised?: string;
  baseExplanation?: string;
}

const TYPE_STYLE: Record<string, { label: string; cls: string }> = {
  characters: { label: 'Characters', cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
  vocabulary: { label: 'Vocabulary', cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
  grammar: { label: 'Grammar', cls: 'bg-sky-50 text-sky-800 ring-sky-200' },
};

export function TypeChip({ tag, count }: { tag: TagChip; count?: number }) {
  const t = TYPE_STYLE[tag.error_type] ?? { label: tag.error_type, cls: 'bg-gray-50 text-gray-700 ring-gray-200' };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${t.cls}`}>
      {count !== undefined ? `${t.label} ${count}` : `${t.label} · ${tag.pattern_name}`}
    </span>
  );
}

interface Props {
  /** Distinguishes the desktop side panel from the phone bottom sheet (unique form ids). */
  slot: string;
  item: Revision;
  /** Diff of the student's words → suggestion; null when the quote wasn't found in the text. */
  ops: DiffOp[] | null;
  n: number;
  total: number;
  canEdit: boolean;
  tags: TagChip[];
  draft: Draft | null;
  /** The comment thread for this correction. */
  discussion?: ReactNode;
  discussionCount?: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onEdit: () => void;
  onDraft: (d: Draft) => void;
  onDone: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onAttach: () => void;
}

/** Details of one correction: what the student wrote, the suggestion, and why. */
export default function RevisionInspector(props: Props) {
  const { slot, item, ops, n, total, canEdit, tags, draft } = props;
  const editing = canEdit && draft?.id === item.id ? draft : null;
  const label = 'text-[11px] font-semibold uppercase tracking-wide text-gray-400';

  return (
    <div className="rounded-lg border border-gray-200 bg-white text-sm shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-2.5">
        <div className="flex items-center gap-1.5 font-medium text-gray-900">
          <NumberBadge n={n} teacher={item.source === 'teacher'} raised={false} />
          <span>
            Correction {n} <span className="font-normal text-gray-400">of {total}</span>
          </span>
        </div>
        <div className="flex items-center">
          <IconButton label="Previous correction" onClick={props.onPrev} disabled={!!editing}>
            &#8249;
          </IconButton>
          <IconButton label="Next correction" onClick={props.onNext} disabled={!!editing}>
            &#8250;
          </IconButton>
          <IconButton label="Close" onClick={props.onClose}>
            &times;
          </IconButton>
        </div>
      </div>

      <div className="space-y-3 px-4 py-3">
        {(tags.length > 0 || item.source === 'teacher') && (
          <div className="flex flex-wrap gap-1.5">
            {item.source === 'teacher' && (
              <span className="inline-flex rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-inset ring-violet-200">
                Added by teacher
              </span>
            )}
            {tags.map((t) => (
              <TypeChip key={`${t.error_type}-${t.pattern_name}`} tag={t} />
            ))}
          </div>
        )}

        {!ops && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
            This sentence wasn&apos;t found in the composition — the AI&apos;s quote doesn&apos;t match what the
            student wrote.
          </p>
        )}

        <div>
          <p className={label}>Student wrote</p>
          <p className="mt-1 leading-7 text-gray-800">{ops ? <DiffOps ops={ops} show="before" /> : item.original}</p>
        </div>

        <div>
          <p className={label}>Suggestion</p>
          {editing ? (
            <textarea
              id={`${slot}-suggestion-${item.id}`}
              autoFocus
              value={editing.revised}
              onChange={(e) => props.onDraft({ ...editing, revised: e.target.value })}
              rows={3}
              className="mt-1 w-full resize-y rounded-md border border-blue-300 px-2.5 py-2 leading-7 outline-none focus:ring-2 focus:ring-blue-500"
            />
          ) : (
            <p className="mt-1 leading-7 text-gray-800">{ops ? <DiffOps ops={ops} show="after" /> : item.revised}</p>
          )}
        </div>

        <div>
          <p className={label}>Why</p>
          {editing ? (
            <textarea
              id={`${slot}-why-${item.id}`}
              value={editing.explanation}
              onChange={(e) => props.onDraft({ ...editing, explanation: e.target.value })}
              rows={4}
              placeholder="Explain the correction for the student"
              className="mt-1 w-full resize-y rounded-md border border-blue-300 px-2.5 py-2 leading-relaxed outline-none focus:ring-2 focus:ring-blue-500"
            />
          ) : (
            <p className="mt-1 whitespace-pre-line leading-relaxed text-gray-700">
              {item.explanation || <span className="italic text-gray-400">No explanation yet</span>}
            </p>
          )}
        </div>

        {canEdit &&
          (editing ? (
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={props.onDone}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                Done
              </button>
              <button type="button" onClick={props.onCancel} className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-800">
                Cancel
              </button>
              <span className="ml-auto text-[11px] text-gray-400">Preview updates in the essay</span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
              <button type="button" onClick={props.onEdit} className="font-medium text-blue-600 hover:underline">
                Edit
              </button>
              {!ops && (
                <button type="button" onClick={props.onAttach} className="font-medium text-blue-600 hover:underline">
                  Attach to text
                </button>
              )}
              <button type="button" onClick={props.onDelete} className="text-red-500 hover:underline">
                Delete
              </button>
              <span className="ml-auto text-[11px] text-gray-400">
                {item.source === 'teacher' ? 'Your correction' : 'AI suggestion'}
              </span>
            </div>
          ))}
      </div>

      {!editing && props.discussion && (
        <div className="border-t border-gray-100 px-4 py-3">
          <p className={label}>Discussion{props.discussionCount ? ` (${props.discussionCount})` : ''}</p>
          <div className="-ml-3">{props.discussion}</div>
        </div>
      )}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-7 w-7 items-center justify-center rounded text-lg leading-none text-gray-500 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-30"
    >
      {children}
    </button>
  );
}
