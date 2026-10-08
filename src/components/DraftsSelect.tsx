'use client';

import { DEFAULT_MAX_DRAFTS, DRAFT_OPTIONS } from '@/types';

/** Teacher setting: how many drafts a student may submit for one composition. */
export default function DraftsSelect({
  id,
  value,
  onChange,
  existingProject = false,
}: {
  id: string;
  value: number;
  onChange: (value: number) => void;
  /** Editing a project that may already have submissions. */
  existingProject?: boolean;
}) {
  const current = DRAFT_OPTIONS.find((o) => o.value === value) ?? DRAFT_OPTIONS[1];
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs text-gray-500">
        Drafts per composition
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
      >
        {DRAFT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
            {o.value === DEFAULT_MAX_DRAFTS ? ' (default)' : ''}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-gray-400">
        {current.hint}
        {existingProject && ' Drafts already submitted stay.'}
      </p>
    </div>
  );
}
