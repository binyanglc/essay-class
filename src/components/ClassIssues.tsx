'use client';

import { useState } from 'react';
import { ERROR_TYPE_LABELS } from '@/types';
import type { DeleteReason } from '@/lib/error-taxonomy';
import type { FamilySummary, IssueGroup, LabelExample } from '@/lib/error-tracking';
import { RemoveReasonPrompt } from './LabelControls';

interface Props {
  errors: IssueGroup[];
  totalSubmissions: number;
  /** "Not natural" suggestions left out of the counts. */
  styleCount?: number;
  includeStyle?: boolean;
  onToggleStyle?: (include: boolean) => void;
  onRefresh?: () => void;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Common Issues: the class's labels by kind → family (e.g. 了) → exact item
 * (e.g. "No 了 after 没"), with how many students each one affects.
 */
export default function ClassIssues({
  errors,
  totalSubmissions,
  styleCount = 0,
  includeStyle = false,
  onToggleStyle,
  onRefresh,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ original: '', revision: '', explanation: '' });
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<LabelExample | null>(null);

  const styleToggle = onToggleStyle && (includeStyle || styleCount > 0) && (
    <label className="inline-flex items-center gap-2 text-xs text-gray-600">
      <input type="checkbox" checked={includeStyle} onChange={(e) => onToggleStyle(e.target.checked)} />
      Include &ldquo;not natural&rdquo; suggestions
      {!includeStyle && styleCount > 0 && <span className="text-gray-400">({styleCount} not counted)</span>}
    </label>
  );

  if (errors.length === 0) {
    return (
      <div className="space-y-3 py-8 text-center">
        <p className="text-gray-500">No submission data yet</p>
        {styleToggle}
      </div>
    );
  }

  const handleStartEdit = (ex: LabelExample) => {
    setEditingId(ex.id);
    setEditDraft({ original: ex.original, revision: ex.revision, explanation: ex.explanation });
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    const res = await fetch(`/api/error-tags/${editingId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        original_text: editDraft.original,
        suggested_revision: editDraft.revision,
        explanation: editDraft.explanation,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setEditingId(null);
      onRefresh?.();
    }
  };

  const handleDelete = async (tagId: string, reason: DeleteReason | null) => {
    setRemoving(null);
    const res = await fetch(`/api/error-tags/${tagId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    if (res.ok) onRefresh?.();
  };

  const example = (ex: LabelExample) => (
    <div key={ex.id} className="rounded-lg bg-gray-50 p-4">
      {editingId === ex.id ? (
        <div className="space-y-2">
          <div>
            <label className="text-xs text-gray-500">Original</label>
            <input
              type="text"
              value={editDraft.original}
              onChange={(e) => setEditDraft((d) => ({ ...d, original: e.target.value }))}
              className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">Revision</label>
            <input
              type="text"
              value={editDraft.revision}
              onChange={(e) => setEditDraft((d) => ({ ...d, revision: e.target.value }))}
              className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">Explanation</label>
            <textarea
              value={editDraft.explanation}
              onChange={(e) => setEditDraft((d) => ({ ...d, explanation: e.target.value }))}
              rows={2}
              className="mt-0.5 w-full resize-y rounded border border-gray-300 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSaveEdit}
              disabled={saving}
              className="rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={() => setEditingId(null)} className="px-3 py-1.5 text-xs text-gray-500">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs font-medium text-blue-600">
              {ex.label}
              {ex.unchecked && (
                <span
                  title="AI suggestion — not yet checked by the teacher"
                  className="rounded bg-white px-1 text-[9px] font-semibold uppercase tracking-wide text-gray-500 ring-1 ring-inset ring-gray-200"
                >
                  AI
                </span>
              )}
            </div>
            {ex.original && <div className="text-sm text-red-600 line-through">{ex.original}</div>}
            {ex.revision && <div className="mt-1 text-sm text-green-700">&rarr; {ex.revision}</div>}
            {ex.explanation && <div className="mt-2 text-xs text-gray-500">{ex.explanation}</div>}
          </div>
          <div className="ml-3 flex flex-shrink-0 items-center gap-2">
            <button onClick={() => handleStartEdit(ex)} className="text-xs text-gray-400 hover:text-blue-600" title="Edit">
              ✏️
            </button>
            <button onClick={() => setRemoving(ex)} className="text-xs text-gray-400 hover:text-red-600" title="Remove this label">
              ✕
            </button>
          </div>
        </div>
      )}
      {removing?.id === ex.id && (
        <div className="mt-2">
          <RemoveReasonPrompt
            name={ex.label}
            onChoose={(reason) => handleDelete(ex.id, reason)}
            onCancel={() => setRemoving(null)}
          />
        </div>
      )}
    </div>
  );

  const family = (f: FamilySummary) => (
    <div key={f.key} className="rounded-lg border border-gray-100 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="font-medium text-gray-900">
          {f.name}
          {f.zh && f.zh !== f.name && <span className="ml-1.5 text-sm font-normal text-gray-500">{f.zh}</span>}
        </h4>
        <span className="text-xs text-gray-500">
          {plural(f.count, 'time')} &middot; {plural(f.students, 'student')}
          {f.unchecked > 0 && <span className="text-gray-400"> &middot; {f.unchecked} not checked</span>}
        </span>
      </div>
      {f.items.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {f.items.slice(0, 8).map((it) => (
            <span
              key={it.key}
              title={`${plural(it.count, 'time')}, ${plural(it.students, 'student')}`}
              className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700"
            >
              {it.name}
              <span className="text-gray-400">
                &times;{it.count}
                {it.students > 1 ? ` · ${it.students} students` : ''}
              </span>
            </span>
          ))}
        </div>
      )}
      {f.examples.length > 0 && (
        <details className="mt-3 group">
          <summary className="cursor-pointer text-xs text-blue-600 hover:underline">
            Examples ({f.examples.length})
          </summary>
          <div className="mt-2 space-y-3">{f.examples.map(example)}</div>
        </details>
      )}
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">Based on {plural(totalSubmissions, 'submission')}</p>
        {styleToggle}
      </div>

      {errors.map((e, idx) => (
        <div key={e.error_type} className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-3">
            <span className="text-2xl font-bold text-blue-600">#{idx + 1}</span>
            <div>
              <h3 className="text-lg font-semibold">{ERROR_TYPE_LABELS[e.error_type] ?? e.error_type}</h3>
              <p className="text-sm text-gray-500">
                {plural(e.count, 'occurrence')} &middot; {plural(e.students, 'student')}
              </p>
            </div>
          </div>
          <div className="space-y-3">{e.families.map(family)}</div>
        </div>
      ))}
    </div>
  );
}
