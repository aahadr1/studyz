import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { seedStarterDeckForUser } from '@/lib/starter-deck-seeder'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * POST /api/starter-deck/seed
 *
 * Idempotently seeds the default CDC/Attaché starter deck for the
 * authenticated user. Safe to call repeatedly: the seeder skips users
 * that already have the deck.
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient()
    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const result = await seedStarterDeckForUser(admin, user.id)

    if (result.status === 'error') {
      console.error('[StarterDeck] Seed failed for user', user.id, result.message)
      return NextResponse.json({ error: result.message ?? 'Seed failed' }, { status: 500 })
    }

    return NextResponse.json(result)
  } catch (err: any) {
    console.error('[StarterDeck] Unhandled error:', err)
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 })
  }
}
