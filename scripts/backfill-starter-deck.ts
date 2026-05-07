/**
 * Backfill the CDC/Attaché starter deck for every existing user.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx scripts/backfill-starter-deck.ts
 *
 * The seeder is idempotent: users that already own the starter deck are
 * skipped. Safe to re-run.
 */

import { createClient } from '@supabase/supabase-js'
import { seedStarterDeckForUser } from '../lib/starter-deck-seeder'

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log('[Backfill] Listing users via Supabase Admin API...')

  // Page through all auth users.
  const allUsers: { id: string; email: string | null }[] = []
  let page = 1
  const perPage = 1000
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) {
      console.error('[Backfill] listUsers failed:', error.message)
      process.exit(1)
    }
    if (!data || data.users.length === 0) break
    for (const u of data.users) allUsers.push({ id: u.id, email: u.email ?? null })
    if (data.users.length < perPage) break
    page += 1
  }

  console.log(`[Backfill] Found ${allUsers.length} user(s).`)

  let seeded = 0
  let skipped = 0
  let failed = 0

  for (const u of allUsers) {
    process.stdout.write(`[Backfill] ${u.email ?? u.id}... `)
    try {
      const result = await seedStarterDeckForUser(admin, u.id)
      if (result.status === 'seeded') {
        seeded += 1
        console.log(`seeded (${result.decks_created} decks / ${result.cards_created} cards)`)
      } else if (result.status === 'already_seeded') {
        skipped += 1
        console.log('already seeded')
      } else {
        failed += 1
        console.log(`ERROR: ${result.message}`)
      }
    } catch (err: any) {
      failed += 1
      console.log(`EXCEPTION: ${err.message}`)
    }
  }

  console.log('---')
  console.log(`[Backfill] Done. seeded=${seeded} skipped=${skipped} failed=${failed}`)
  if (failed > 0) process.exit(2)
}

main().catch((err) => {
  console.error('[Backfill] Fatal:', err)
  process.exit(1)
})
