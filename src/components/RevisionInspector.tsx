'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import type { DiffOp } from '@/lib/track-changes';
import type { Revision } from '@/lib/revisions';
import type { DeleteReason } from '@/lib/error-taxonomy';
import { isUnconfirmedAi, tagLabel } from '@/lib/error-taxonomy';
import type { LabelFields } from '@/lib/tag-edits';
import type { DraftLabels } from '@/lib/draft-labels';
import { DiffOps, NumberBadge } from './TrackChangesView';
import { LABELS_TIP, LabelChip, LabelEditor, LabelsTip, RemoveReasonPrompt, changesFromOps } from './LabelControls';
import { useTipDismissed } from '@/lib/tips';
import type { LabelSuggestion, TagChip } from './LabelControls';

export type { LabelSuggestion, TagChip } from './LabelControls';

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
  /** Label changes made while editing; they are applied on Done and dropped on Cancel. */
  labels?: DraftLabels;
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
  /** Teacher only: remove an error label from this correction (reason optional). */
  onRemoveTag?: (tagId: string, reason: DeleteReason | null) => void;
  /** Teacher only: label this correction. */
  onAddTag?: (label: LabelFields) => void;
  /** Teacher only: change a label. */
  onUpdateTag?: (tagId: string, label: LabelFields) => void;
  /** Teacher only: keep an AI label as it is. */
  onConfirmTag?: (tagId: string) => void;
  labelSuggestions?: LabelSuggestion[];
}

/** Details of one correction: what the student wrote, the suggestion, and why. */
export default function RevisionInspector(props: Props) {
  const { slot, item, ops, n, total, canEdit, tags, draft } = props;
  const editing = canEdit && draft?.id === item.id ? draft : null;
  // Which label is being changed ("new" = adding one); closes if that label is removed
  const [labelChoice, setLabelEditing] = useState<string | null>(null);
  const labelEditing = labelChoice === 'new' || tags.some((t) => t.id === labelChoice) ? labelChoice : null;
  // Which label is being removed (asks for an optional reason)
  const [removeChoice, setRemoving] = useState<string | null>(null);
  const removing = tags.find((t) => t.id === removeChoice) ?? null;
  const canLabel = canEdit && !!props.onAddTag;
  const label = 'text-[11px] font-semibold uppercase tracking-wide text-gray-400';
  const changes = changesFromOps(ops);
  const sameLabel = (a: LabelFields, b: TagChip) =>
    a.code === b.code &&
    (a.rule ?? null) === (b.rule ?? null) &&
    (a.item_target ?? null) === (b.item_target ?? null) &&
    (a.item_learner ?? null) === (b.item_learner ?? null);
  const unchecked = tags.some(isUnconfirmedAi);
  const tipDismissed = useTipDismissed(LABELS_TIP);

  const teacherBadge = item.source === 'teacher' && (
    <span className="inline-flex rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-inset ring-violet-200">
      Added by teacher
    </span>
  );
  const labelChips = (
    <>
      {tags.map((t) => (
        <LabelChip
          key={t.id ?? `${t.code ?? t.error_type}-${t.pattern_name}`}
          tag={t}
          onRemove={canEdit && props.onRemoveTag && t.id ? () => setRemoving(t.id!) : undefined}
          onEdit={canLabel && props.onUpdateTag && t.id ? () => setLabelEditing(t.id!) : undefined}
          onConfirm={
            canLabel && props.onConfirmTag && t.id && isUnconfirmedAi(t) ? () => props.onConfirmTag?.(t.id!) : undefined
          }
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
    </>
  );
  // Choosing a label, or a reason for removing one
  const labelForms = (
    <>
      {canEdit && removing && props.onRemoveTag && (
        <RemoveReasonPrompt
          name={tagLabel(removing)}
          onChoose={(reason) => {
            props.onRemoveTag?.(removing.id!, reason);
            setRemoving(null);
          }}
          onCancel={() => setRemoving(null)}
        />
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
                  return t
                    ? {
                        code: t.code ?? '',
                        rule: t.rule ?? null,
                        item_target: t.item_target ?? null,
                        item_learner: t.item_learner ?? null,
                        nature: (t.nature as LabelFields['nature']) ?? undefined,
                        custom_label: t.custom_label ?? null,
                      }
                    : undefined;
                })()
          }
          changes={changes}
          suggestions={props.labelSuggestions ?? []}
          onSave={(fields) => {
            // This correction already has that label: keep one
            const duplicate = tags.some((t) => t.id !== labelEditing && sameLabel(fields, t));
            if (labelEditing === 'new') {
              if (!duplicate) props.onAddTag?.(fields);
            } else if (duplicate) {
              props.onRemoveTag?.(labelEditing, null);
            } else {
              props.onUpdateTag?.(labelEditing, fields);
            }
            setLabelEditing(null);
          }}
          onCancel={() => setLabelEditing(null)}
        />
      )}
    </>
  );
  const labelBusy = labelEditing !== null || !!removing;

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
        {item.source === 'teacher' && <div className="flex flex-wrap items-center gap-1.5">{teacherBadge}</div>}

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

        {(canLabel || tags.length > 0) && (
          <div>
            <p className={label}>Labels</p>
            {canLabel && (
              <div className="mt-1">
                <LabelsTip />
              </div>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {labelChips}
              {tags.length === 0 && labelEditing === null && tipDismissed && (
                <span className="text-[11px] leading-snug text-gray-400">
                  Add a label so this counts in the student&apos;s error patterns and Common Issues
                </span>
              )}
            </div>
            {!canEdit && unchecked && (
              <p className="mt-1 text-[11px] leading-snug text-gray-400">
                Labels marked AI are suggestions — your teacher hasn&apos;t checked them yet.
              </p>
            )}
            {labelBusy && <div className="mt-2 space-y-2">{labelForms}</div>}
          </div>
        )}

        {canEdit &&
          (editing ? (
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={props.onDone}
                disabled={labelBusy}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
              >
                Done
              </button>
              <button
                type="button"
                onClick={() => {
                  setLabelEditing(null);
                  setRemoving(null);
                  props.onCancel();
                }}
                className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-800"
              >
                Cancel
              </button>
              <span className="ml-auto text-[11px] text-gray-400">
                {labelBusy ? 'Finish the label first' : 'Preview updates in the essay'}
              </span>
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
