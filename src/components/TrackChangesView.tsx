'use client';

import { useRef, useState } from 'react';
import { segmentText, splitSentences } from '@/lib/track-changes';
import type { DiffOp, Placement, PlacedRevision, Segment } from '@/lib/track-changes';
import type { Revision } from '@/lib/revisions';

export type EssayMode = 'track' | 'original' | 'revised';

interface Props {
  text: string;
  placement: Placement<Revision>;
  numbers: Map<string, number>;
  mode: EssayMode;
  activeId: string | null;
  onActivate: (id: string) => void;
  /** Teacher only: called with the range of the student's text the reader selected. */
  onSelectRange?: (start: number, end: number) => void;
  selectLabel?: string;
  /** Teacher only: called when an unmarked sentence is clicked. */
  onPickSentence?: (start: number, end: number) => void;
}

export const DEL_CLASS = 'text-red-600 line-through decoration-red-500/80 bg-red-50 rounded-sm';
export const INS_CLASS =
  'text-green-800 bg-green-100 rounded-sm underline decoration-green-600/70 underline-offset-[5px]';

/**
 * The whole composition, Word-style: deleted text struck through in red,
 * inserted text underlined in green, a numbered badge after each correction.
 */
export default function TrackChangesView({
  text,
  placement,
  numbers,
  mode,
  activeId,
  onActivate,
  onSelectRange,
  selectLabel = '+ Add correction',
  onPickSentence,
}: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<{
    start: number;
    end: number;
    x: number;
    y: number;
    error?: string;
  } | null>(null);

  const canSelect = !!onSelectRange && mode !== 'revised';

  function handleSelectionEnd() {
    if (!canSelect) return;
    const box = boxRef.current;
    const sel = window.getSelection();
    if (!box || !sel || sel.isCollapsed || !sel.rangeCount) {
      setPending(null);
      return;
    }
    const range = sel.getRangeAt(0);
    if (!box.contains(range.startContainer) || !box.contains(range.endContainer)) {
      setPending(null);
      return;
    }
    const rect = range.getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();
    const x = Math.min(Math.max(rect.left - boxRect.left + rect.width / 2, 80), boxRect.width - 80);
    const y = rect.bottom - boxRect.top + 8;

    const a = offsetOf(range.startContainer, range.startOffset);
    const b = offsetOf(range.endContainer, range.endOffset);
    if (a === null || b === null) {
      setPending({ start: 0, end: 0, x, y, error: 'Select text outside the marked corrections' });
      return;
    }
    let start = Math.min(a, b);
    let end = Math.max(a, b);
    while (start < end && /\s/.test(text[start])) start++;
    while (end > start && /\s/.test(text[end - 1])) end--;
    if (start >= end) {
      setPending(null);
      return;
    }
    const clash = placement.placed.find((p) => start < p.end && p.start < end);
    setPending({
      start,
      end,
      x,
      y,
      error: clash ? `This overlaps correction ${numbers.get(clash.rev.id)}` : undefined,
    });
  }

  const segments: Segment<Revision>[] =
    mode === 'original'
      ? [{ kind: 'plain', start: 0, end: text.length, text }]
      : segmentText(text, placement.placed);

  const canPick = !!onPickSentence && mode !== 'revised';

  function pick(start: number, end: number) {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return; // the reader is selecting words, not clicking
    onPickSentence?.(start, end);
  }

  // Unmarked text. For the teacher, each sentence can be clicked to correct it.
  function renderPlain(seg: { start: number; end: number; text: string }) {
    if (!canPick) {
      return (
        <span key={`p${seg.start}`} data-start={seg.start}>
          {seg.text}
        </span>
      );
    }
    return splitSentences(text, seg.start, seg.end).map((p) =>
      p.blank ? (
        <span key={`b${p.start}`} data-start={p.start}>
          {text.slice(p.start, p.end)}
        </span>
      ) : (
        <span
          key={`s${p.start}`}
          data-start={p.start}
          role="button"
          tabIndex={0}
          title="Click to correct this sentence"
          onClick={() => pick(p.start, p.end)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onPickSentence?.(p.start, p.end);
            }
          }}
          className="cursor-pointer rounded box-decoration-clone transition-colors hover:bg-gray-200/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          {text.slice(p.start, p.end)}
        </span>
      )
    );
  }

  return (
    <div
      ref={boxRef}
      className="relative whitespace-pre-wrap break-words text-[16px] leading-[2.1] text-gray-800"
      onMouseDown={() => setPending(null)}
      onMouseUp={handleSelectionEnd}
      onKeyUp={(e) => e.shiftKey && handleSelectionEnd()}
    >
      {segments.map((seg) =>
        seg.kind === 'plain' ? (
          renderPlain(seg)
        ) : (
          <RevisionMark
            key={seg.placed.rev.id}
            placed={seg.placed}
            n={numbers.get(seg.placed.rev.id) ?? 0}
            active={activeId === seg.placed.rev.id}
            showRevised={mode === 'revised'}
            onActivate={onActivate}
          />
        )
      )}

      {pending && canSelect && (
        <div className="absolute z-20 -translate-x-1/2 whitespace-nowrap" style={{ left: pending.x, top: pending.y }}>
          {pending.error ? (
            <span className="block rounded-md bg-gray-900 px-2.5 py-1.5 text-xs leading-normal text-white shadow-lg">
              {pending.error}
            </span>
          ) : (
            <button
              type="button"
              // Keep the text selection, and don't let the container's handlers hide this button
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onMouseUp={(e) => e.stopPropagation()}
              onClick={() => {
                onSelectRange?.(pending.start, pending.end);
                setPending(null);
                window.getSelection()?.removeAllRanges();
              }}
              className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium leading-normal text-white shadow-lg hover:bg-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
            >
              {selectLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Offset in the student's text for a DOM selection boundary, or null inside a correction. */
function offsetOf(node: Node, offset: number): number | null {
  const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
  const holder = el?.closest<HTMLElement>('[data-start]');
  if (!holder) return null;
  const base = Number(holder.dataset.start);
  if (node.nodeType === Node.TEXT_NODE) return base + offset;
  return offset === 0 ? base : base + (holder.textContent?.length ?? 0);
}

function RevisionMark({
  placed,
  n,
  active,
  showRevised,
  onActivate,
}: {
  placed: PlacedRevision<Revision>;
  n: number;
  active: boolean;
  showRevised: boolean;
  onActivate: (id: string) => void;
}) {
  const id = placed.rev.id;
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={`Correction ${n}`}
      aria-pressed={active}
      data-rev={id}
      onClick={() => onActivate(id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onActivate(id);
        }
      }}
      className={`cursor-pointer rounded box-decoration-clone transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ${
        active ? 'bg-blue-100 ring-1 ring-blue-300' : 'hover:bg-blue-50'
      }`}
    >
      {showRevised ? (
        <span className="rounded-sm bg-green-50 box-decoration-clone">{placed.revised}</span>
      ) : (
        <DiffOps ops={placed.ops} />
      )}
      <NumberBadge n={n} teacher={placed.rev.source === 'teacher'} />
    </span>
  );
}

export function DiffOps({ ops, show = 'both' }: { ops: DiffOp[]; show?: 'both' | 'before' | 'after' }) {
  return (
    <>
      {ops.map((op, i) => {
        if (op.type === 'equal') return <span key={i}>{op.text}</span>;
        if (op.type === 'delete')
          return show === 'after' ? null : (
            <del key={i} className={DEL_CLASS}>
              {op.text}
            </del>
          );
        return show === 'before' ? null : (
          <ins key={i} className={INS_CLASS}>
            {op.text}
          </ins>
        );
      })}
    </>
  );
}

export function NumberBadge({
  n,
  teacher = false,
  raised = true,
}: {
  n: number;
  teacher?: boolean;
  raised?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block min-w-[15px] rounded-full px-[4px] text-center text-[10px] font-semibold not-italic leading-[15px] text-white ${
        raised ? 'ml-0.5 -translate-y-[0.6em]' : ''
      } ${teacher ? 'bg-violet-600' : 'bg-blue-600'}`}
    >
      {n}
    </span>
  );
}
