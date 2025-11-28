import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Singleton instance to avoid multiple client warnings
let supabaseInstance: SupabaseClient | null = null

export function createClient() {
  if (supabaseInstance) {
    return supabaseInstance
  }
  
  supabaseInstance = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  })
  
  return supabaseInstance
}

// Export singleton instance for convenience
export const supabase = createClient()
