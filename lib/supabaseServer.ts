/**
 * Supabase Server Client
 * 
 * This file provides a Supabase client configured with the service role key
 * for server-side operations. NEVER import this file on the client side.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Singleton instance
let supabaseServerClient: SupabaseClient | null = null

/**
 * Get a Supabase client configured with the service role key.
 * This client bypasses RLS and should only be used server-side.
 */
export function getSupabaseServerClient(): SupabaseClient {
  if (!supabaseServerClient) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl) {
      throw new Error('Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL environment variable')
    }

    if (!supabaseServiceRoleKey) {
      throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable')
    }

    supabaseServerClient = createClient(
      supabaseUrl,
      supabaseServiceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )
  }
  return supabaseServerClient
}

export default getSupabaseServerClient

