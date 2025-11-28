import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Check if we're on the client side
const isBrowser = typeof window !== 'undefined'

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
      // Use cookie-based storage for better SSR support
      storage: isBrowser ? {
        getItem: (key: string) => {
          // Try localStorage first for backward compatibility
          const fromLocalStorage = window.localStorage.getItem(key)
          if (fromLocalStorage) {
            return fromLocalStorage
          }
          // Then try cookies
          const cookies = document.cookie.split(';')
          for (const cookie of cookies) {
            const [name, value] = cookie.trim().split('=')
            if (name === key) {
              return decodeURIComponent(value)
            }
          }
          return null
        },
        setItem: (key: string, value: string) => {
          // Store in both localStorage and cookies
          window.localStorage.setItem(key, value)
          // Set cookie with proper attributes
          const maxAge = 60 * 60 * 24 * 7 // 7 days
          document.cookie = `${key}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`
        },
        removeItem: (key: string) => {
          window.localStorage.removeItem(key)
          // Remove cookie
          document.cookie = `${key}=; path=/; max-age=0`
        },
      } : undefined,
    },
  })
  
  return supabaseInstance
}

// Export singleton instance for convenience
export const supabase = createClient()
