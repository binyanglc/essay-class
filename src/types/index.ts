export type UserRole = 'teacher' | 'student';

export type ErrorType =
  | 'vocabulary_word_choice'
  | 'collocation'
  | 'grammar_le'
  | 'grammar_de'
  | 'word_order'
  | 'punctuation'
  | 'coherence_transition'
  | 'register_style'
  | 'character_error'
  | 'other';

export const ERROR_TYPE_LABELS: Record<ErrorType, string> = {
  vocabulary_word_choice: 'Vocabulary / Word Choice',
  collocation: 'Collocation',
  grammar_le: 'Grammar (了)',
  grammar_de: 'Grammar (的/地/得)',
  word_order: 'Word Order',
  punctuation: 'Punctuation',
  coherence_transition: 'Coherence / Transitions',
  register_style: 'Register / Style',
  character_error: 'Character Error',
  other: 'Other',
};

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
  title: string | null;
  assignment_name: string | null;
  image_url: string | null;
  ocr_text: string | null;
  final_text: string;
  created_at: string;
  feedback?: Feedback;
  profiles?: Profile;
}

export interface Feedback {
  id: string;
  submission_id: string;
  overall_comment: string;
  strengths: string[];
  main_problems: string[];
  sentence_revisions: SentenceRevision[];
  repeated_error_summary: string;
  next_step_advice: string;
  created_at: string;
}

export interface SentenceRevision {
  original: string;
  revised: string;
  explanation: string;
}

export interface ErrorTag {
  id: string;
  submission_id: string;
  student_id: string;
  error_type: ErrorType;
  original_text: string;
  suggested_revision: string;
  explanation: string;
  sentence_index: number | null;
  created_at: string;
}

export interface ErrorFrequency {
  error_type: ErrorType;
  count: number;
  examples: { original: string; revision: string }[];
}

export interface AIFeedbackResponse {
  overall_comment: string;
  strengths: string[];
  main_problems: string[];
  sentence_revisions: SentenceRevision[];
  error_tags: {
    error_type: ErrorType;
    original_text: string;
    suggested_revision: string;
    explanation: string;
    sentence_index: number | null;
  }[];
  repeated_error_summary: string;
  next_step_advice: string;
}
