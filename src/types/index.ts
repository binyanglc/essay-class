export type UserRole = 'teacher' | 'student';

export type ErrorType =
  | 'characters'
  | 'vocabulary'
  | 'grammar'
  | 'content'
  | 'structure'
  | 'punctuation'
  | 'discourse'
  | 'register'
  | 'expression';

export const ERROR_TAG_TYPES = ['characters', 'vocabulary', 'grammar'] as const;

export const ERROR_TYPE_LABELS: Record<string, string> = {
  characters: 'Characters',
  vocabulary: 'Vocabulary & Word Choice',
  grammar: 'Grammar',
  content: 'Content & Ideas',
  structure: 'Organization & Structure',
  punctuation: 'Punctuation',
  discourse: 'Linking & Flow',
  register: 'Register & Tone',
  expression: 'Natural Expression',
};

export const FEEDBACK_SECTION_ORDER: ErrorType[] = [
  'characters',
  'vocabulary',
  'grammar',
];

export interface Profile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  created_at: string;
}

export interface Class {
  id: string;
  class_name: string;
  teacher_id: string;
  invite_code: string;
  created_at: string;
}

/** How strictly the AI corrects a composition (set per project by the teacher). */
export type CorrectionLevel = 'essential' | 'standard' | 'detailed';

export const CORRECTION_LEVELS: { value: CorrectionLevel; label: string; hint: string }[] = [
  {
    value: 'essential',
    label: 'Essential',
    hint: 'Only clear mistakes. Sentences that are understandable and grammatical are left alone.',
  },
  {
    value: 'standard',
    label: 'Standard',
    hint: 'Mistakes plus phrasing that is clearly unnatural. Acceptable sentences are left alone.',
  },
  {
    value: 'detailed',
    label: 'Detailed',
    hint: 'Also suggests more natural phrasing, at the student’s level.',
  },
];

export function isCorrectionLevel(v: unknown): v is CorrectionLevel {
  return v === 'essential' || v === 'standard' || v === 'detailed';
}

/** What students get (set per project by the teacher, migration v16). */
export type FeedbackStyle = 'corrections' | 'hints';

export const FEEDBACK_STYLES: { value: FeedbackStyle; label: string; hint: string }[] = [
  {
    value: 'corrections',
    label: 'Corrections',
    hint: 'Students see each corrected sentence and why it was changed.',
  },
  {
    value: 'hints',
    label: 'Hints only',
    hint: 'Students see where each problem is, what kind it is and a short hint — never the corrected sentence. They fix it themselves. You still see the full corrections.',
  },
];

export function isFeedbackStyle(v: unknown): v is FeedbackStyle {
  return v === 'corrections' || v === 'hints';
}

/** How many drafts a student may submit for one composition (set per project, migration v17). */
export const DRAFT_OPTIONS: { value: number; label: string; hint: string }[] = [
  { value: 1, label: '1 — no revising', hint: 'Students submit once.' },
  {
    value: 2,
    label: '2',
    hint: 'After seeing the feedback, students can revise their composition once and submit it again.',
  },
  { value: 3, label: '3', hint: 'Students can revise and resubmit twice.' },
];

export const DEFAULT_MAX_DRAFTS = 2;

export function isMaxDrafts(v: unknown): v is number {
  return v === 1 || v === 2 || v === 3;
}

/** When students see the feedback (set per project by the teacher, migration v14). */
export type FeedbackRelease = 'immediate' | 'after_review';

export const FEEDBACK_RELEASES: { value: FeedbackRelease; label: string; hint: string }[] = [
  {
    value: 'immediate',
    label: 'Right after they submit',
    hint: 'Students see the AI feedback straight away. You can still check and edit it afterwards.',
  },
  {
    value: 'after_review',
    label: 'After I check and release it',
    hint: 'Students see the feedback only once you release it. You see it, and Common Issues, straight away.',
  },
];

export function isFeedbackRelease(v: unknown): v is FeedbackRelease {
  return v === 'immediate' || v === 'after_review';
}

export interface Project {
  id: string;
  class_id: string;
  project_name: string;
  description: string;
  due_date: string | null;
  /** Added in migration v9; older rows default to 'standard'. */
  correction_level?: CorrectionLevel;
  /** Added in migration v14; older rows default to 'immediate'. */
  feedback_release?: FeedbackRelease;
  /** Added in migration v16; older rows default to 'corrections'. */
  feedback_style?: FeedbackStyle;
  /** How many drafts a student may submit for one composition: 1–3 (migration v17; default 2). */
  max_drafts?: number;
  created_at: string;
}

export interface ClassMember {
  id: string;
  class_id: string;
  student_id: string;
  joined_at: string;
  profiles?: Profile;
}

export interface Submission {
  id: string;
  student_id: string;
  class_id: string;
  project_id: string | null;
  title: string | null;
  assignment_name: string | null;
  /** Legacy public URL (before migration v9). */
  image_url: string | null;
  /** Storage path of the uploaded photo in the private `compositions` bucket. */
  image_path?: string | null;
  ocr_text: string | null;
  final_text: string;
  /** Later drafts point at the composition's first draft (migration v17); null for a first draft. */
  first_draft_id?: string | null;
  /** 1 for a first draft (migration v17). */
  draft_number?: number;
  created_at: string;
  feedback?: Feedback;
  profiles?: Profile;
  projects?: Project;
}

export interface Feedback {
  id: string;
  submission_id: string;
  overall_comment: string;
  strengths: string[];
  main_problems: string[];
  characters_comment: string;
  vocabulary_comment: string;
  grammar_comment: string;
  content_feedback: string;
  structure_feedback: string;
  sentence_revisions: SentenceRevision[];
  repeated_error_summary: string;
  next_step_advice: string;
  teacher_edited_at: string | null;
  /** Level the AI used; null for older feedback (which only corrected a few key sentences). */
  correction_level?: CorrectionLevel | null;
  /** When the student could first see it; null = waiting for the teacher to release it (migration v14). */
  released_at?: string | null;
  /** When the class teacher first opened it; null = not yet (migration v15). */
  teacher_viewed_at?: string | null;
  /** 'hints': the student never sees the corrected sentences (migration v16); null/absent = corrections. */
  feedback_style?: FeedbackStyle | null;
  created_at: string;
}

export interface SentenceRevision {
  original: string;
  revised: string;
  explanation: string;
  /** Stable id; older feedback gets one when it is first loaded (see lib/revisions). */
  id?: string;
  /** [start, end) of `original` in the composition, when known. */
  start?: number;
  end?: number;
  /** Who suggested it. */
  source?: 'ai' | 'teacher';
  /** Comment section key for revisions created before ids existed (e.g. "sentence_2"). */
  commentKey?: string;
  /** "Hints only": one sentence for the student that doesn't give the answer (AI-written, teacher can edit). */
  hint?: string;
  /** Where `original` changes, worked out on the server from original → revised (see lib/hints). */
  marks?: HintMark[];
}

/** One changed place in a revision's `original`: [start, end) offsets within it (start = end: something is missing there). */
export interface HintMark {
  start: number;
  end: number;
  kind: HintKind;
}

export type HintKind = 'missing' | 'extra' | 'wrong' | 'order';

export interface ErrorTag {
  id: string;
  submission_id: string;
  student_id: string;
  error_type: ErrorType;
  pattern_name: string;
  original_text: string;
  suggested_revision: string;
  explanation: string;
  improvement_tip: string;
  sentence_index: number | null;
  created_at: string;
  // Added in migration v12 (taxonomy v1). Older labels have none of these.
  /** Label code from lib/error-taxonomy, e.g. "GRAM.LE". */
  code?: string | null;
  /** Misuse rule, e.g. "R.LE.NEG". */
  rule?: string | null;
  /** The right word(s) ("认识") and what the student wrote ("知道"). */
  item_target?: string | null;
  item_learner?: string | null;
  /** Grammar point in the HSK syllabus (2025) — filled in once the syllabus is imported. */
  grammar_point?: string | null;
  nature?: 'error' | 'infelicity' | 'variant' | null;
  severity?: 'global' | 'local' | null;
  operation?: 'missing' | 'unnecessary' | 'replace' | 'order' | null;
  source?: 'ai' | 'teacher' | null;
  status?: 'suggested' | 'confirmed' | 'accepted' | 'modified' | 'added' | 'deleted' | null;
  delete_reason?: 'ai_wrong' | 'not_error' | 'not_now' | null;
  deleted_at?: string | null;
  /** The teacher's own wording for the label. */
  custom_label?: string | null;
  /** Id of the sentence revision (correction) the label belongs to. */
  revision_id?: string | null;
  /** The AI's label as first given (kept when the teacher changes it). */
  ai_original?: Record<string, unknown> | null;
  taxonomy_version?: string | null;
  model?: string | null;
}

export interface ErrorPattern {
  pattern_name: string;
  error_type: ErrorType;
  count: number;
  examples: {
    original: string;
    revision: string;
    explanation: string;
  }[];
  improvement_tip: string;
}

export interface ErrorFrequency {
  error_type: ErrorType;
  count: number;
  examples: { original: string; revision: string }[];
}

export interface FeedbackComment {
  id: string;
  feedback_id: string;
  section: string;
  user_id: string;
  role: 'student' | 'teacher';
  message: string;
  created_at: string;
  profiles?: Profile;
}

export interface AIFeedbackResponse {
  overall_comment: string;
  characters_comment: string;
  vocabulary_comment: string;
  grammar_comment: string;
  content_feedback: string;
  structure_feedback: string;
  sentence_revisions: SentenceRevision[];
}
