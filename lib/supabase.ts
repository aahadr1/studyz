import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)

export type Database = {
  public: {
    Tables: {
      lessons: {
        Row: {
          id: string
          user_id: string
          name: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          created_at?: string
          updated_at?: string
        }
      }
      documents: {
        Row: {
          id: string
          lesson_id: string
          name: string
          file_path: string
          file_type: string
          page_count: number
          created_at: string
        }
        Insert: {
          id?: string
          lesson_id: string
          name: string
          file_path: string
          file_type: string
          page_count?: number
          created_at?: string
        }
        Update: {
          id?: string
          lesson_id?: string
          name?: string
          file_path?: string
          file_type?: string
          page_count?: number
          created_at?: string
        }
      }
      document_pages: {
        Row: {
          id: string
          document_id: string
          page_number: number
          image_path: string
          created_at: string
        }
        Insert: {
          id?: string
          document_id: string
          page_number: number
          image_path: string
          created_at?: string
        }
        Update: {
          id?: string
          document_id?: string
          page_number?: number
          image_path?: string
          created_at?: string
        }
      }
    }
  }
}

