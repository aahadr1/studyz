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

export interface McqSet {
  id: string
  user_id: string
  name?: string
  source_pdf_name?: string
  document_url?: string
  total_pages: number
  total_questions: number
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
}
