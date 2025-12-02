// TypeScript types for database tables

// Add types here as needed
export interface User {
  id: string
  email: string
  full_name?: string
  created_at: string
}

export interface Lesson {
  id: string
  user_id: string
  name: string
  document_url?: string
  total_pages: number
  created_at: string
}

export interface LessonPage {
  id: string
  lesson_id: string
  page_number: number
  image_url: string
}

export interface LessonMessage {
  id: string
  lesson_id: string
  role: 'user' | 'assistant'
  content: string
  page_context?: number
  created_at: string
}

// MCQ Types

export interface LessonCard {
  title: string
  conceptOverview: string
  detailedExplanation: string
  keyPoints: string[]
  example: string
  memoryHook: string
}

export interface GeneratedLesson {
  title: string
  introduction: string
  sections: LessonSection[]
  conclusion: string
}

export interface LessonSection {
  id: string
  title: string
  content: string
  question_ids: string[]
}

export interface McqSet {
  id: string
  user_id: string
  name?: string
  source_pdf_name?: string
  document_url?: string
  total_pages: number
  total_questions: number
  is_corrected: boolean
  has_lesson_cards: boolean
  lesson_content?: GeneratedLesson
  created_at: string
}

export interface McqPage {
  id: string
  mcq_set_id: string
  page_number: number
  image_url: string
  extracted_question_count: number
}

export interface McqQuestion {
  id: string
  mcq_set_id: string
  page_number: number
  question: string
  options: Array<{ label: string; text: string }>
  correct_option: string
  explanation?: string
  section_id?: string
  lesson_card?: LessonCard
  is_corrected: boolean
  difficulty_score: number
  times_answered: number
  times_correct: number
}

export interface McqSession {
  id: string
  mcq_set_id: string
  user_id: string
  started_at: string
  ended_at?: string
  mode: 'study' | 'test' | 'challenge' | 'review'
  total_questions: number
  questions_answered: number
  correct_answers: number
  total_time_seconds: number
  is_completed: boolean
}

export interface McqSessionAnswer {
  id: string
  session_id: string
  question_id: string
  selected_option: string
  is_correct: boolean
  time_spent_seconds: number
  answered_at: string
}

// Interactive Lessons Types

export interface InteractiveLesson {
  id: string
  user_id: string
  name: string
  subject?: string
  level?: string
  language: string
  mode: 'document_based' | 'mcq_only'
  status: 'draft' | 'processing' | 'ready' | 'error'
  error_message?: string
  source_lesson_id?: string
  processing_step?: string
  processing_progress?: number
  processing_total?: number
  processing_message?: string
  processing_percent?: number
  mcq_status?: 'none' | 'generating' | 'ready' | 'error'
  mcq_generation_progress?: number
  mcq_total_count?: number
  mcq_error_message?: string
  created_at: string
  updated_at: string
}

export interface InteractiveLessonDocument {
  id: string
  interactive_lesson_id: string
  category: 'lesson' | 'mcq'
  name: string
  file_path: string
  file_type: string
  page_count: number
  created_at: string
}

export interface InteractiveLessonPageImage {
  id: string
  document_id: string
  page_number: number
  image_path: string
  width?: number
  height?: number
  created_at: string
}

export interface InteractiveLessonSection {
  id: string
  interactive_lesson_id: string
  document_id?: string
  section_order: number
  title: string
  start_page: number
  end_page: number
  summary?: string
  key_points?: string[]
  pass_threshold: number
  created_at: string
}

export interface InteractiveLessonQuestion {
  id: string
  section_id?: string
  checkpoint_id?: string
  question: string
  choices: string[]
  correct_index: number
  explanation?: string
  question_order: number
  created_at: string
}

export interface InteractiveLessonProgress {
  id: string
  user_id: string
  interactive_lesson_id: string
  section_id: string
  status: 'locked' | 'current' | 'completed'
  score?: number
  attempts: number
  completed_at?: string
  created_at: string
  updated_at: string
}

// Page-based MCQ Types for Interactive Lessons

export interface PageMCQ {
  id: string
  interactive_lesson_id: string
  page_number: number
  question: string
  choices: string[] // ["A. ...", "B. ...", "C. ...", "D. ..."]
  correct_index: number
  explanation?: string
  source_type: 'uploaded_doc' | 'uploaded_text' | 'ai_generated'
  question_order: number
  created_at: string
}

export interface PageMCQProgress {
  id: string
  user_id: string
  mcq_id: string
  is_correct: boolean
  selected_index: number
  answered_at: string
}

export interface PageMCQWithProgress extends PageMCQ {
  progress?: PageMCQProgress
}
