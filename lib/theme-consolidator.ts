/**
 * Theme consolidation for flashcards.
 *
 * After all cards are generated, the user may end up with too many themes
 * (sometimes one theme per card). When the user asked to "group by theme",
 * we want to reorganise everything into a small number of meaningful stacks
 * (target: 3 to 10 stacks max).
 *
 * Strategy:
 *   1. If there are ≤ MAX_STACKS unique themes, keep them as-is but merge
 *      tiny themes (< MIN_PER_STACK cards) into "Other".
 *   2. Otherwise, ask the LLM ONCE to propose 3-10 broad theme buckets and
 *      assign each card to one of them. We send only a compact projection
 *      of each card (clean_number + theme + first 80 chars of front) so the
 *      call stays fast and cheap.
 *   3. As a deterministic fallback (or if the LLM fails), keep the top
 *      (MAX_STACKS - 1) most-frequent themes and lump everything else into
 *      "Other".
 */

import OpenAI from 'openai'

export interface CardForGrouping {
  index: number     // index into the caller's array
  front: string
  theme?: string | null
}

export interface GroupedDeck {
  theme: string
  card_indices: number[]
}

const MIN_STACKS = 3
const MAX_STACKS = 10
const TARGET_MIN_PER_STACK = 5 // we'd like each stack to have at least this many cards if possible

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────
export async function consolidateThemes(
  openai: OpenAI,
  cards: CardForGrouping[]
): Promise<GroupedDeck[]> {
  if (cards.length === 0) return []

  // If we have very few cards, don't try to split
  if (cards.length <= 5) {
    return [
      {
        theme: 'All cards',
        card_indices: cards.map((c) => c.index),
      },
    ]
  }

  const themeFreq = countThemes(cards)
  const uniqueThemes = themeFreq.size
  const targetK = decideTargetStackCount(cards.length)

  // Easy case: we already have a reasonable number of themes
  if (uniqueThemes <= MAX_STACKS && uniqueThemes >= MIN_STACKS) {
    return groupByExistingThemes(cards, themeFreq)
  }

  // Hard case: too many themes (or too few). Try LLM consolidation.
  try {
    const llmResult = await consolidateWithLLM(openai, cards, targetK)
    if (llmResult && llmResult.length >= 1 && llmResult.length <= MAX_STACKS) {
      return llmResult
    }
  } catch (err: any) {
    console.warn('[ThemeConsolidator] LLM consolidation failed:', err.message)
  }

  // Deterministic fallback: keep top (K-1) most frequent, merge rest into Other
  return fallbackTopK(cards, themeFreq, targetK)
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────
function decideTargetStackCount(cardCount: number): number {
  // Roughly sqrt(cardCount / TARGET_MIN_PER_STACK), clamped to [MIN_STACKS, MAX_STACKS]
  const raw = Math.round(Math.sqrt(cardCount / TARGET_MIN_PER_STACK))
  return Math.max(MIN_STACKS, Math.min(MAX_STACKS, raw))
}

function countThemes(cards: CardForGrouping[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const c of cards) {
    const key = normaliseTheme(c.theme)
    map.set(key, (map.get(key) || 0) + 1)
  }
  return map
}

function normaliseTheme(t: string | null | undefined): string {
  const v = (t || '').trim()
  if (!v) return 'Misc'
  return v.charAt(0).toUpperCase() + v.slice(1)
}

function groupByExistingThemes(
  cards: CardForGrouping[],
  themeFreq: Map<string, number>
): GroupedDeck[] {
  // Merge tiny themes (< TARGET_MIN_PER_STACK) into "Other"
  const tinyThemes = new Set<string>()
  for (const [theme, count] of themeFreq) {
    if (count < TARGET_MIN_PER_STACK) tinyThemes.add(theme)
  }
  // But only do the merge if there are at least 3 surviving themes
  const survivors = [...themeFreq.keys()].filter((t) => !tinyThemes.has(t))
  const shouldMerge = survivors.length >= MIN_STACKS && tinyThemes.size > 0

  const buckets = new Map<string, number[]>()
  for (const c of cards) {
    const theme = normaliseTheme(c.theme)
    const key = shouldMerge && tinyThemes.has(theme) ? 'Other' : theme
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(c.index)
  }

  return [...buckets.entries()]
    .map(([theme, indices]) => ({ theme, card_indices: indices }))
    .sort((a, b) => b.card_indices.length - a.card_indices.length)
}

function fallbackTopK(
  cards: CardForGrouping[],
  themeFreq: Map<string, number>,
  targetK: number
): GroupedDeck[] {
  const sorted = [...themeFreq.entries()].sort((a, b) => b[1] - a[1])
  const keepCount = Math.max(1, targetK - 1)
  const keep = new Set(sorted.slice(0, keepCount).map(([t]) => t))

  const buckets = new Map<string, number[]>()
  for (const c of cards) {
    const t = normaliseTheme(c.theme)
    const key = keep.has(t) ? t : 'Other'
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(c.index)
  }

  return [...buckets.entries()]
    .map(([theme, indices]) => ({ theme, card_indices: indices }))
    .sort((a, b) => b.card_indices.length - a.card_indices.length)
}

// ────────────────────────────────────────────────────────────────────────────
// LLM consolidation
// ────────────────────────────────────────────────────────────────────────────
const CONSOLIDATION_SYSTEM_PROMPT = `You are an expert curriculum organiser.

You receive a list of flashcard fronts (the "questions") plus an optional pre-existing theme tag for each. Your task is to propose between 3 and 10 BROAD, MEANINGFUL theme buckets that cover all the cards, then assign every card to exactly one bucket.

## STRICT RULES

1. Produce between ${MIN_STACKS} and ${MAX_STACKS} theme buckets — no more, no fewer (if you genuinely cannot split into ${MIN_STACKS}, use 2; if every card fits in 1, use 1).
2. Each card MUST be assigned to exactly one bucket.
3. Bucket names must be short (2-5 words), descriptive, and in the same language as the cards (French for French cards, English for English).
4. Aim for buckets of comparable size — avoid creating a bucket that contains a single card (merge it into the closest larger bucket instead).
5. Use the existing theme tags as hints when they make sense, but feel free to merge or split them.

## OUTPUT FORMAT — STRICT JSON ONLY

{
  "buckets": [
    {
      "name": "Anatomie cardiaque",
      "card_ids": [1, 4, 7, 12, 18, 21]
    },
    {
      "name": "Physiologie respiratoire",
      "card_ids": [2, 5, 9, 13]
    }
  ]
}

The card_ids reference the "id" field given in the input. EVERY input id must appear in exactly one bucket. Do NOT invent ids.`

interface LLMBucket {
  name: string
  card_ids: number[]
}

async function consolidateWithLLM(
  openai: OpenAI,
  cards: CardForGrouping[],
  targetK: number
): Promise<GroupedDeck[] | null> {
  // Build a compact projection: id + theme + short snippet
  const compact = cards.map((c) => ({
    id: c.index,
    theme: c.theme || null,
    snippet: (c.front || '').replace(/\s+/g, ' ').slice(0, 140),
  }))

  const userPrompt = `Group the following ${cards.length} flashcards into ${targetK} broad themes (between ${MIN_STACKS} and ${MAX_STACKS}).

Each card has:
- id: integer (you must reference these exact ids)
- theme: an initial theme guess (may be inconsistent or empty)
- snippet: the front of the card, truncated to ~140 chars

Cards:
${JSON.stringify(compact, null, 2)}`

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 16000,
    temperature: 0.0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: CONSOLIDATION_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  })

  const raw = response.choices[0]?.message?.content || ''
  const parsed = safeJsonParse<{ buckets: LLMBucket[] }>(raw, { buckets: [] })
  const buckets = Array.isArray(parsed.buckets) ? parsed.buckets : []
  if (buckets.length === 0) return null

  // Validate: every card must appear, no duplicate assignments
  const seen = new Set<number>()
  const cleanedBuckets: GroupedDeck[] = []
  for (const b of buckets) {
    const ids = (b.card_ids || []).filter(
      (id) => typeof id === 'number' && Number.isFinite(id) && !seen.has(id)
    )
    for (const id of ids) seen.add(id)
    if (ids.length === 0) continue
    cleanedBuckets.push({
      theme: typeof b.name === 'string' && b.name.trim() ? b.name.trim() : 'Misc',
      card_indices: ids,
    })
  }

  // Catch any unassigned cards into "Other"
  const unassigned = cards.filter((c) => !seen.has(c.index)).map((c) => c.index)
  if (unassigned.length > 0) {
    if (cleanedBuckets.length < MAX_STACKS) {
      cleanedBuckets.push({ theme: 'Other', card_indices: unassigned })
    } else {
      // Merge into the smallest bucket
      cleanedBuckets.sort((a, b) => a.card_indices.length - b.card_indices.length)
      cleanedBuckets[0].card_indices.push(...unassigned)
    }
  }

  // Sort buckets: largest first
  cleanedBuckets.sort((a, b) => b.card_indices.length - a.card_indices.length)

  // Final cap at MAX_STACKS — merge surplus into the smallest survivor
  if (cleanedBuckets.length > MAX_STACKS) {
    const survivors = cleanedBuckets.slice(0, MAX_STACKS - 1)
    const tail = cleanedBuckets.slice(MAX_STACKS - 1)
    const merged: GroupedDeck = {
      theme: 'Other',
      card_indices: tail.flatMap((b) => b.card_indices),
    }
    return [...survivors, merged]
  }

  return cleanedBuckets
}

function safeJsonParse<T = any>(raw: string, fallback: T): T {
  try {
    const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
    return JSON.parse(cleaned)
  } catch {
    return fallback
  }
}
