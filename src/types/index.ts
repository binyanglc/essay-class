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
  vocabulary_word_choice: '词汇选择',
  collocation: '搭配',
  grammar_le: '语法（了）',
  grammar_de: '语法（的/地/得）',
  word_order: '语序',
  punctuation: '标点',
  coherence_transition: '连贯/过渡',
  register_style: '语体/风格',
  character_error: '错别字',
  other: '其他',
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
