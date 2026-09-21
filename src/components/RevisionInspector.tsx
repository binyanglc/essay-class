'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import type { DiffOp } from '@/lib/track-changes';
import type { ErrorType } from '@/types';
import type { Revision } from '@/lib/revisions';
import { DiffOps, NumberBadge } from './TrackChangesView';

export interface TagChip {
  id?: string;
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

export function TypeChip({
  tag,
  count,
  onRemove,
  onEdit,
}: {
  tag: TagChip;
  count?: number;
  onRemove?: () => void;
  onEdit?: () => void;
}) {
  const t = TYPE_STYLE[tag.error_type] ?? { label: tag.error_type, cls: 'bg-gray-50 text-gray-700 ring-gray-200' };
  const text = count !== undefined ? `${t.label} ${count}` : `${t.label} · ${tag.pattern_name}`;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${t.cls}`}>
      {onEdit ? (
        <button type="button" onClick={onEdit} title="Change this label" className="hover:underline">
          {text}
        </button>
      ) : (
        text
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove label ${tag.pattern_name}`}
          title="Remove this label"
          className="-mr-1 px-0.5 text-sm leading-none opacity-60 hover:text-red-600 hover:opacity-100"
        >
          &times;
        </button>
      )}
    </span>
  );
}

export interface LabelSuggestion {
  error_type: string;
  pattern_name: string;
}

const LABEL_TYPES: ErrorType[] = ['characters', 'vocabulary', 'grammar'];

// Common labels, suggested after the names this class already uses
const DEFAULT_LABELS: LabelSuggestion[] = [
  { error_type: 'characters', pattern_name: 'Wrong character' },
  { error_type: 'characters', pattern_name: 'Similar-sounding character' },
  { error_type: 'characters', pattern_name: 'Similar-looking character' },
  { error_type: 'vocabulary', pattern_name: 'Word choice' },
  { error_type: 'vocabulary', pattern_name: 'Collocation' },
  { error_type: 'vocabulary', pattern_name: 'Measure word' },
  { error_type: 'grammar', pattern_name: '了 usage' },
  { error_type: 'grammar', pattern_name: 'Word order' },
  { error_type: 'grammar', pattern_name: '的 / 得 / 地' },
  { error_type: 'grammar', pattern_name: 'Sentence structure' },
];

/** Type + name of an error label, with the names already used in this class suggested first. */
function LabelEditor({
  id,
  initial,
  suggestions,
  onSave,
  onCancel,
}: {
  id: string;
  initial?: { error_type: ErrorType; pattern_name: string };
  suggestions: LabelSuggestion[];
  onSave: (label: { error_type: ErrorType; pattern_name: string }) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<ErrorType>(initial?.error_type ?? 'grammar');
  const [name, setName] = useState(initial?.pattern_name ?? '');
  const names = Array.from(
    new Set([...suggestions, ...DEFAULT_LABELS].filter((s) => s.error_type === type).map((s) => s.pattern_name))
  );
  const save = () => name.trim() && onSave({ error_type: type, pattern_name: name.trim() });
  return (
    <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50/60 p-2">
      <div className="flex gap-1.5">
        <select
          id={`${id}-type`}
          aria-label="Error type"
          value={type}
          onChange={(e) => setType(e.target.value as ErrorType)}
          className="shrink-0 rounded border border-gray-300 bg-white px-1.5 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-500"
        >
          {LABEL_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_STYLE[t].label}
            </option>
          ))}
        </select>
        <input
          id={`${id}-name`}
          aria-label="Label name"
          list={`${id}-names`}
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') onCancel();
          }}
          placeholder="e.g. 了 usage"
          className="min-w-0 flex-1 rounded border border-gray-300 bg-white px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-500"
        />
        <datalist id={`${id}-names`}>
          {names.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={!name.trim()}
          className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
        >
          {initial ? 'Change' : 'Add'}
        </button>
        <button type="button" onClick={onCancel} className="px-1 text-xs text-gray-500 hover:text-gray-800">
          Cancel
        </button>
      </div>
    </div>
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
  /** Teacher only: remove an error label from this correction. */
  onRemoveTag?: (tagId: string) => void;
  /** Teacher only: label this correction. */
  onAddTag?: (label: { error_type: ErrorType; pattern_name: string }) => void;
  /** Teacher only: change a label's type or name. */
  onUpdateTag?: (tagId: string, label: { error_type: ErrorType; pattern_name: string }) => void;
  labelSuggestions?: LabelSuggestion[];
}

/** Details of one correction: what the student wrote, the suggestion, and why. */
export default function RevisionInspector(props: Props) {
  const { slot, item, ops, n, total, canEdit, tags, draft } = props;
  const editing = canEdit && draft?.id === item.id ? draft : null;
  // Which label is being changed ("new" = adding one); closes if that label is removed
  const [labelChoice, setLabelEditing] = useState<string | null>(null);
  const labelEditing = labelChoice === 'new' || tags.some((t) => t.id === labelChoice) ? labelChoice : null;
  const canLabel = canEdit && !editing && !!props.onAddTag;
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
        {(tags.length > 0 || item.source === 'teacher' || canLabel) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {item.source === 'teacher' && (
              <span className="inline-flex rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-inset ring-violet-200">
                Added by teacher
              </span>
            )}
            {tags.map((t) => (
              <TypeChip
                key={t.id ?? `${t.error_type}-${t.pattern_name}`}
                tag={t}
                onRemove={canEdit && props.onRemoveTag && t.id ? () => props.onRemoveTag?.(t.id!) : undefined}
                onEdit={canLabel && props.onUpdateTag && t.id ? () => setLabelEditing(t.id!) : undefined}
              />
            ))}
            {canLabel && labelEditing === null && (
              <button
                type="button"
                onClick={() => setLabelEditing('new')}
                className="rounded-full px-2 py-0.5 text-[11px] font-medium text-blue-600 ring-1 ring-inset ring-blue-200 hover:bg-blue-50"
              >
                + Label
              </button>
            )}
          </div>
        )}
        {canLabel && labelEditing !== null && (
          <LabelEditor
            key={labelEditing}
            id={`${slot}-label-${item.id}`}
            initial={
              labelEditing === 'new'
                ? undefined
                : (() => {
                    const t = tags.find((x) => x.id === labelEditing);
                    return t ? { error_type: t.error_type as ErrorType, pattern_name: t.pattern_name } : undefined;
                  })()
            }
            suggestions={props.labelSuggestions ?? []}
            onSave={(label) => {
              // This correction already has that label: keep one
              const duplicate = tags.some(
                (t) => t.id !== labelEditing && t.error_type === label.error_type && t.pattern_name === label.pattern_name
              );
              if (labelEditing === 'new') {
                if (!duplicate) props.onAddTag?.(label);
              } else if (duplicate) {
                props.onRemoveTag?.(labelEditing);
              } else {
                props.onUpdateTag?.(labelEditing, label);
              }
              setLabelEditing(null);
            }}
            onCancel={() => setLabelEditing(null)}
          />
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

        {(editing || item.explanation) && (
        <div>
          <p className={label}>Why</p>
          {editing ? (
            <>
            <textarea
              id={`${slot}-why-${item.id}`}
              value={editing.explanation}
              onChange={(e) => props.onDraft({ ...editing, explanation: e.target.value })}
              rows={4}
              placeholder="Optional — explain the correction for the student"
              className="mt-1 w-full resize-y rounded-md border border-blue-300 px-2.5 py-2 leading-relaxed outline-none focus:ring-2 focus:ring-blue-500"
            />
            {!editing.isNew &&
              editing.revised !== editing.baseRevised &&
              editing.explanation === editing.baseExplanation &&
              !!editing.explanation.trim() && (
                <p className="mt-1 text-[11px] leading-snug text-amber-700">
                  You changed the suggestion — check that the explanation still matches it.
                </p>
              )}
            </>
          ) : (
            <p className="mt-1 whitespace-pre-line leading-relaxed text-gray-700">{item.explanation}</p>
          )}
        </div>
        )}

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
