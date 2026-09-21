'use client';

import { CORRECTION_LEVELS } from '@/types';
import type { CorrectionLevel } from '@/types';

/** Teacher setting: how strictly the AI corrects submissions for a project. */
export default function CorrectionLevelSelect({
  id,
  value,
  onChange,
  existingProject = false,
}: {
  id: string;
  value: CorrectionLevel;
  onChange: (value: CorrectionLevel) => void;
  /** Editing a project that may already have feedback. */
  existingProject?: boolean;
}) {
  const current = CORRECTION_LEVELS.find((l) => l.value === value) ?? CORRECTION_LEVELS[1];
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs text-gray-500">
        AI correction level
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as CorrectionLevel)}
        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
      >
        {CORRECTION_LEVELS.map((l) => (
          <option key={l.value} value={l.value}>
            {l.label}
            {l.value === 'standard' ? ' (default)' : ''}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-gray-400">
        {current.hint}
        {existingProject && ' Feedback already given stays as it is.'}
      </p>
    </div>
  );
}
