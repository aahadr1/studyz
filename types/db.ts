// TypeScript types for OCR Documents database tables

export type DocumentStatus = 'pending_ocr' | 'processing' | 'ocr_done' | 'error'

export type DocumentPageStatus = 'pending' | 'processing' | 'done' | 'error'

export interface Document {
  id: string
  original_file_path: string
  status: DocumentStatus
  full_text: string | null
  created_at: string
  updated_at: string
}

export interface DocumentPage {
  id: number
  document_id: string
  page_number: number
  image_path: string
  ocr_text: string | null
  status: DocumentPageStatus
  created_at: string
  updated_at: string
}

// Insert types (for creating new records)
export interface DocumentInsert {
  id?: string
  original_file_path: string
  status?: DocumentStatus
  full_text?: string | null
}

export interface DocumentPageInsert {
  document_id: string
  page_number: number
  image_path: string
  ocr_text?: string | null
  status?: DocumentPageStatus
}

// Update types (for updating records)
export interface DocumentUpdate {
  original_file_path?: string
  status?: DocumentStatus
  full_text?: string | null
  updated_at?: string
}

export interface DocumentPageUpdate {
  ocr_text?: string | null
  status?: DocumentPageStatus
  updated_at?: string
}

// Database types for Supabase client
export interface Database {
  public: {
    Tables: {
      documents: {
        Row: Document
        Insert: DocumentInsert
        Update: DocumentUpdate
      }
      document_pages: {
        Row: DocumentPage
        Insert: DocumentPageInsert
        Update: DocumentPageUpdate
      }
    }
  }
}

