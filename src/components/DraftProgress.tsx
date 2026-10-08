'use client';

import type { HintMark } from '@/types';
import type { DiffOp } from '@/lib/track-changes';
import { DRAFT_STATUS_LABELS, countStatuses } from '@/lib/drafts';
import type { DraftStatus } from '@/lib/drafts';
import { HintSentence } from './HintsView';

export interface DraftProblem {
  id: string;
  /** The student's words in the earlier draft (null if they weren't found). */
  original: string | null;
  /** "Hints only": where the problem was. */
  marks?: HintMark[];
}

const STATUS_STYLE: Record<DraftStatus, string> = {
  fixed: 'bg-green-50 text-green-800 ring-green-200',
  still: 'bg-amber-50 text-amber-800 ring-amber-200',
  unchanged: 'bg-gray-100 text-gray-600 ring-gray-200',
};

function StatusChip({ status }: { status: DraftStatus }) {
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${STATUS_STYLE[status]}`}>
      {status === 'fixed' ? '✓ ' : ''}
      {DRAFT_STATUS_LABELS[status]}
    </span>
  );
}

/**
 * How the problems of the last draft fared in this one: fixed, still needs
 * work, or not changed yet (worked out by comparing the drafts, see lib/drafts).
 */
export default function DraftProgress({
  problems,
  statuses,
  prevLabel,
  forTeacher = false,
}: {
  problems: DraftProblem[];
  statuses: Map<string, DraftStatus>;
  /** e.g. "draft 1" */
  prevLabel: string;
  forTeacher?: boolean;
}) {
  const shown = problems.filter((p) => statuses.has(p.id));
  if (shown.length === 0) return null;
  const counts = countStatuses(statuses);
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-semibold text-gray-900">From {prevLabel}</h3>
        <span className="text-gray-600">
          <span className="font-medium text-green-700">✓ {counts.fixed} fixed</span>
          {counts.still > 0 && <> &middot; {counts.still} still {counts.still === 1 ? 'needs' : 'need'} work</>}
          {counts.unchanged > 0 && <> &middot; {counts.unchanged} not changed yet</>}
        </span>
      </div>
      <p className="mt-1 text-xs text-gray-400">
        {forTeacher
          ? 'Fixed = the student changed it and the AI no longer corrects it (even if worded differently from the AI).'
          : 'Fixed = you changed it and it no longer needs correcting.'}
      </p>
      <ul className="mt-3 space-y-2">
        {shown.map((p, i) => {
          const status = statuses.get(p.id)!;
          return (
            <li key={p.id} className="flex items-start gap-2">
              <span className="mt-1 w-5 shrink-0 text-right text-xs text-gray-400">{i + 1}.</span>
              <div className="min-w-0 flex-1">
                {p.marks ? (
                  <HintSentence hint={{ id: p.id, original: p.original, marks: p.marks }} />
                ) : (
                  <p className={`leading-7 ${status === 'fixed' ? 'text-gray-500' : 'text-gray-900'}`}>{p.original}</p>
                )}
              </div>
              <StatusChip status={status} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** What the student changed from one draft to the next: removed text struck through, added text underlined. */
export function DraftChanges({ ops }: { ops: DiffOp[] }) {
  return (
    <div className="whitespace-pre-wrap rounded-lg bg-gray-50 p-4 text-[16px] leading-9 text-gray-900">
      {ops.map((op, i) =>
        op.type === 'equal' ? (
          <span key={i}>{op.text}</span>
        ) : op.type === 'delete' ? (
          <del key={i} className="text-red-600 decoration-red-400">
            {op.text}
          </del>
        ) : (
          <ins key={i} className="rounded-sm bg-green-50 text-green-800 no-underline underline-offset-4 [text-decoration-line:underline]">
            {op.text}
          </ins>
        )
      )}
    </div>
  );
}
