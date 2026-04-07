'use client';

import { useState } from 'react';
import { ERROR_TYPE_LABELS, ErrorType } from '@/types';

interface ExampleItem {
  id: string;
  original: string;
  revision: string;
  explanation: string;
}

interface ClassError {
  error_type: ErrorType;
  count: number;
  examples: ExampleItem[];
}

interface Props {
  errors: ClassError[];
  totalSubmissions: number;
  onRefresh?: () => void;
}

export default function ClassIssues({ errors, totalSubmissions, onRefresh }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ original: '', revision: '', explanation: '' });
  const [saving, setSaving] = useState(false);

  if (errors.length === 0) {
    return (
      <p className="text-gray-500 text-center py-12">No submission data yet</p>
    );
  }

  const handleStartEdit = (ex: ExampleItem) => {
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

  const handleDelete = async (tagId: string) => {
    if (!confirm('Delete this error example?')) return;
    const res = await fetch(`/api/error-tags/${tagId}`, { method: 'DELETE' });
    if (res.ok) onRefresh?.();
  };

  return (
    <div className="space-y-8">
      <p className="text-sm text-gray-500">
        Based on {totalSubmissions} recent submissions
      </p>

      {errors.slice(0, 5).map((e, idx) => (
        <div
          key={e.error_type}
          className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl font-bold text-blue-600">
              #{idx + 1}
            </span>
            <div>
              <h3 className="font-semibold text-lg">
                {ERROR_TYPE_LABELS[e.error_type]}
              </h3>
              <p className="text-sm text-gray-500">{e.count} occurrences</p>
            </div>
          </div>

          <div className="space-y-3">
            {e.examples.map((ex) => (
              <div key={ex.id} className="bg-gray-50 rounded-lg p-4">
                {editingId === ex.id ? (
                  <div className="space-y-2">
                    <div>
                      <label className="text-xs text-gray-500">Original</label>
                      <input
                        type="text"
                        value={editDraft.original}
                        onChange={(e) => setEditDraft((d) => ({ ...d, original: e.target.value }))}
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm mt-0.5 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Revision</label>
                      <input
                        type="text"
                        value={editDraft.revision}
                        onChange={(e) => setEditDraft((d) => ({ ...d, revision: e.target.value }))}
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm mt-0.5 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Explanation</label>
                      <textarea
                        value={editDraft.explanation}
                        onChange={(e) => setEditDraft((d) => ({ ...d, explanation: e.target.value }))}
                        rows={2}
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm mt-0.5 focus:ring-2 focus:ring-blue-500 outline-none resize-y"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveEdit}
                        disabled={saving}
                        className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-xs text-gray-500 px-3 py-1.5"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-red-600 line-through">
                          {ex.original}
                        </div>
                        <div className="text-sm text-green-700 mt-1">
                          &rarr; {ex.revision}
                        </div>
                        {ex.explanation && (
                          <div className="text-xs text-gray-500 mt-2">
                            {ex.explanation}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                        <button
                          onClick={() => handleStartEdit(ex)}
                          className="text-xs text-gray-400 hover:text-blue-600"
                          title="Edit"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDelete(ex.id)}
                          className="text-xs text-gray-400 hover:text-red-600"
                          title="Delete"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
