/**
 * Starter Deck Seeder
 * --------------------
 * Inserts the default starter flashcard sets into a user's flashcard library.
 *
 * Idempotent: if a deck with our marker prefix is already present for the
 * user, the seeder exits without touching anything.
 *
 * Designed to be safe to call from:
 *   - the auto-seed API route (silent first-visit hook)
 *   - the one-shot backfill script for existing accounts
 *   - any future admin tooling
 */

import * as fs from 'fs'
import * as path from 'path'
import type { SupabaseClient } from '@supabase/supabase-js'

// Marker stored in flashcard_decks.source_pdf_name to identify decks
// produced by this seeder. Bump the suffix when shipping a new version
// to allow re-seeding without duplicating older runs.
export const STARTER_DECK_MARKER_PREFIX = '__starter:cdc-attache-v4__'
export const PREVENTION_PRACTICAL_2_MARKER_PREFIX = '__starter:prevention-practical-2-v1__'

interface StarterDeckConfig {
  markerPrefix: string
  markerPattern: string
  directory: string
  namePrefix: string
}

interface ManifestStack {
  number: number
  title: string
  description: string
  card_range: string
  card_count: number
  file: string
}

interface ManifestData {
  deck_name: string
  deck_description: string
  language: string
  version: string
  total_cards: number
  stacks: ManifestStack[]
}

interface StackCard {
  n: number
  front: string
  back: string
}

interface StackFile {
  stack_number: number
  cards: StackCard[]
}

export interface SeederResult {
  status: 'seeded' | 'already_seeded' | 'error'
  decks_created: number
  cards_created: number
  message?: string
}

const STARTER_DECKS: StarterDeckConfig[] = [
  {
    markerPrefix: STARTER_DECK_MARKER_PREFIX,
    markerPattern: '__starter:cdc-attache-v%',
    directory: 'starter-deck',
    namePrefix: 'CDC',
  },
  {
    markerPrefix: PREVENTION_PRACTICAL_2_MARKER_PREFIX,
    markerPattern: '__starter:prevention-practical-2-v%',
    directory: 'starter-deck-prevention-practical-2',
    namePrefix: 'Prevention Practical 2',
  },
]

const _cachedDeckData = new Map<string, { manifest: ManifestData; stacks: Map<number, StackFile> }>()

function getStarterDeckDir(directory: string): string {
  // process.cwd() is the project root in Next.js / Node scripts
  return path.join(process.cwd(), 'data', directory)
}

function loadStarterDeckData(config: StarterDeckConfig): { manifest: ManifestData; stacks: Map<number, StackFile> } {
  const cached = _cachedDeckData.get(config.directory)
  if (cached) {
    return cached
  }

  const dir = getStarterDeckDir(config.directory)
  const manifestPath = path.join(dir, 'manifest.json')
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Starter deck manifest not found at ${manifestPath}`)
  }

  const manifest: ManifestData = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const stacks = new Map<number, StackFile>()
  let totalCards = 0
  for (const stackMeta of manifest.stacks) {
    const stackPath = path.join(dir, stackMeta.file)
    if (!fs.existsSync(stackPath)) {
      throw new Error(`Starter deck stack file missing: ${stackPath}`)
    }
    const stack: StackFile = JSON.parse(fs.readFileSync(stackPath, 'utf8'))
    if (!Array.isArray(stack.cards) || stack.cards.length !== stackMeta.card_count) {
      throw new Error(
        `Stack ${stackMeta.number} card count mismatch: expected ${stackMeta.card_count}, got ${stack.cards?.length ?? 0}`
      )
    }
    stacks.set(stackMeta.number, stack)
    totalCards += stack.cards.length
  }

  if (totalCards !== manifest.total_cards) {
    throw new Error(
      `Starter deck total mismatch: manifest says ${manifest.total_cards}, files contain ${totalCards}`
    )
  }

  const loaded = { manifest, stacks }
  _cachedDeckData.set(config.directory, loaded)
  return loaded
}

function deckMarkerForStack(config: StarterDeckConfig, stackNumber: number): string {
  return `${config.markerPrefix}:stack-${String(stackNumber).padStart(2, '0')}`
}

function deckNameForStack(config: StarterDeckConfig, stackMeta: ManifestStack): string {
  // Number prefix keeps decks ordered alphabetically in the user's list.
  const num = String(stackMeta.number).padStart(2, '0')
  return `${config.namePrefix} ${num}. ${stackMeta.title}`
}

/**
 * Seed one starter deck set for a single user.
 */
async function seedStarterDeckSetForUser(
  admin: SupabaseClient,
  userId: string,
  config: StarterDeckConfig
): Promise<SeederResult> {
  let manifest: ManifestData
  let stacks: Map<number, StackFile>
  try {
    const data = loadStarterDeckData(config)
    manifest = data.manifest
    stacks = data.stacks
  } catch (err: any) {
    return { status: 'error', decks_created: 0, cards_created: 0, message: err.message }
  }

  // Idempotency: skip if this specific starter deck set already exists.
  const { data: existing, error: existingErr } = await admin
    .from('flashcard_decks')
    .select('id')
    .eq('user_id', userId)
    .like('source_pdf_name', config.markerPattern)
    .limit(1)

  if (existingErr) {
    return {
      status: 'error',
      decks_created: 0,
      cards_created: 0,
      message: `Failed to check existing starter decks: ${existingErr.message}`,
    }
  }

  if (existing && existing.length > 0) {
    return {
      status: 'already_seeded',
      decks_created: 0,
      cards_created: 0,
      message: `User already has ${manifest.deck_name}`,
    }
  }

  let totalDecks = 0
  let totalCards = 0

  for (const stackMeta of manifest.stacks) {
    const stack = stacks.get(stackMeta.number)
    if (!stack) continue

    const { data: deck, error: deckErr } = await admin
      .from('flashcard_decks')
      .insert({
        user_id: userId,
        name: deckNameForStack(config, stackMeta),
        description: stackMeta.description,
        source_pdf_name: deckMarkerForStack(config, stackMeta.number),
        total_cards: stack.cards.length,
        new_count: stack.cards.length,
        due_count: 0,
      })
      .select('id')
      .single()

    if (deckErr || !deck) {
      // Best-effort cleanup is unnecessary: each deck is independent and
      // future runs will skip already-seeded users via the marker check.
      return {
        status: 'error',
        decks_created: totalDecks,
        cards_created: totalCards,
        message: `Failed to create deck for stack ${stackMeta.number}: ${deckErr?.message ?? 'unknown error'}`,
      }
    }

    totalDecks += 1

    const rows = stack.cards.map((c) => ({
      deck_id: deck.id,
      user_id: userId,
      card_type: 'basic',
      front: c.front,
      back: c.back,
    }))

    // Insert in chunks of 100 to stay well below any row-size limits.
    const CHUNK = 100
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK)
      const { error: cardsErr } = await admin.from('flashcard_cards').insert(slice)
      if (cardsErr) {
        return {
          status: 'error',
          decks_created: totalDecks,
          cards_created: totalCards,
          message: `Failed to insert cards for stack ${stackMeta.number}: ${cardsErr.message}`,
        }
      }
      totalCards += slice.length
    }
  }

  return {
    status: 'seeded',
    decks_created: totalDecks,
    cards_created: totalCards,
    message: `Seeded ${totalDecks} decks / ${totalCards} cards (${manifest.deck_name})`,
  }
}

/**
 * Seed (or no-op) all starter deck sets for a single user.
 * Uses an admin Supabase client (service role) so it can also be invoked
 * from server contexts where the user's JWT is not available.
 */
export async function seedStarterDeckForUser(
  admin: SupabaseClient,
  userId: string
): Promise<SeederResult> {
  if (!userId) {
    return { status: 'error', decks_created: 0, cards_created: 0, message: 'userId required' }
  }

  let totalDecks = 0
  let totalCards = 0
  let seededSets = 0
  let alreadySeededSets = 0
  const messages: string[] = []

  for (const config of STARTER_DECKS) {
    const result = await seedStarterDeckSetForUser(admin, userId, config)
    totalDecks += result.decks_created
    totalCards += result.cards_created
    if (result.message) messages.push(result.message)

    if (result.status === 'error') {
      return {
        status: 'error',
        decks_created: totalDecks,
        cards_created: totalCards,
        message: result.message,
      }
    }

    if (result.status === 'seeded') seededSets += 1
    if (result.status === 'already_seeded') alreadySeededSets += 1
  }

  return {
    status: seededSets > 0 ? 'seeded' : 'already_seeded',
    decks_created: totalDecks,
    cards_created: totalCards,
    message: messages.join(' | ') || `Starter decks checked (${alreadySeededSets} already present)`,
  }
}
