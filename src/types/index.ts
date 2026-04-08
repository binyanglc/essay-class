export type UserRole = 'teacher' | 'student';

export type ErrorType =
  | 'characters'
  | 'vocabulary'
  | 'grammar'
  | 'content'
  | 'structure'
  | 'punctuation';

export const ERROR_TAG_TYPES = ['characters', 'vocabulary', 'grammar'] as const;

export const ERROR_TYPE_LABELS: Record<string, string> = {
  characters: 'Characters',
  vocabulary: 'Vocabulary & Word Choice',
  grammar: 'Grammar',
  content: 'Content & Ideas',
  structure: 'Organization & Structure',
  punctuation: 'Punctuation',
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

export interface Project {
  id: string;
  class_id: string;
  project_name: string;
  description: string;
  due_date: string | null;
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
  image_url: string | null;
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
  pattern_name: string;
  original_text: string;
  suggested_revision: string;
  explanation: string;
  improvement_tip: string;
  sentence_index: number | null;
  created_at: string;
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
  error_tags: {
    error_type: string;
    pattern_name: string;
    original_text: string;
    suggested_revision: string;
    explanation: string;
    improvement_tip: string;
    sentence_index: number | null;
  }[];
}
