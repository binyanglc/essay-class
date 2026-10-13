'use client';

import { COURSE_LEVELS, HSK_LEVELS, courseLevel, hskLabel, hskRange, isStudentLevel, studentLevelLabel, withArticle } from '@/types';
import type { HskLevel, StudentLevel } from '@/types';

function hint(value: StudentLevel | null): string {
  if (!value) return 'The AI judges the level from each composition, and may use words your students haven’t learned yet.';
  const c = courseLevel(value);
  const kind = c
    ? `${withArticle(c.label.toLowerCase())} student would know (about ${hskRange(value)})`
    : `at ${hskLabel(value as HskLevel)} or below (2025 HSK syllabus)`;
  return `The AI corrects with words and grammar ${kind}, and keeps the student’s own words where it can.`;
}

/**
 * Teacher setting: the students' level, so the AI corrects at that level
 * (migration v18). The kind of course comes first — most teachers don't know
 * their students' HSK level — then exact HSK levels for those who do.
 */
export default function StudentLevelSelect({
  id,
  value,
  onChange,
  existingProject = false,
}: {
  id: string;
  value: StudentLevel | null;
  onChange: (value: StudentLevel | null) => void;
  /** Editing a project that may already have feedback. */
  existingProject?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs text-gray-500">
        Student level
      </label>
      <select
        id={id}
        value={value ?? ''}
        onChange={(e) => onChange(isStudentLevel(e.target.value) ? e.target.value : null)}
        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">Not set</option>
        <optgroup label="By course level">
          {COURSE_LEVELS.map((c) => (
            <option key={c.value} value={c.value}>
              {studentLevelLabel(c.value)}
            </option>
          ))}
        </optgroup>
        <optgroup label="Exact HSK level (if you know it)">
          {HSK_LEVELS.map((l) => (
            <option key={l} value={l}>
              {hskLabel(l)}
            </option>
          ))}
        </optgroup>
      </select>
      <p className="mt-1 text-xs text-gray-400">
        {hint(value)}
        {existingProject && ' Feedback already given stays as it is.'}
      </p>
    </div>
  );
}
