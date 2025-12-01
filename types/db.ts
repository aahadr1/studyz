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
