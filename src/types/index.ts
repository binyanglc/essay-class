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

export interface Project {
  id: string;
  class_id: string;
  project_name: string;
  description: string;
  due_date: string | null;
  /** Added in migration v9; older rows default to 'standard'. */
  correction_level?: CorrectionLevel;
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
}

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
  status?: 'suggested' | 'confirmed' | 'modified' | 'added' | 'deleted' | null;
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
