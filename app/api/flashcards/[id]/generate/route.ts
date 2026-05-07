import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import {
  FLASHCARD_GENERATION_SYSTEM_PROMPT,
  createFlashcardUserPrompt,
  QUESTION_EXTRACTION_SYSTEM_PROMPT,
  createQuestionExtractionPrompt,
  ANSWER_GENERATION_SYSTEM_PROMPT,
  createAnswerGenerationPrompt,
} from '@/lib/prompts'
import { parseStructuredCards } from '@/lib/structured-source-parser'
import { consolidateThemes, type CardForGrouping } from '@/lib/theme-consolidator'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

// ────────────────────────────────────────────────────────────────────────────
// Tunables — these are intentionally conservative for accuracy.
// ────────────────────────────────────────────────────────────────────────────
const MAX_QUESTIONS = 500
// Phase 1 — extraction
const EXTRACTION_CHUNK_CHARS = 14_000   // smaller chunks → fewer questions per call → no token-limit truncation
const EXTRACTION_CHUNK_OVERLAP = 700    // overlap between consecutive chunks (avoid splitting mid-question)
// Phase 2 — answers
const ANSWER_BATCH_SIZE = 12            // number of questions per answer-generation call (smaller = more accurate)
const ANSWER_SOURCE_BUDGET = 30_000     // max source-text chars sent to phase-2 calls (truncated if larger)
// Hard input cap (server-side safety) — generous enough for ~500 cards × ~3KB each
const MAX_INPUT_CHARS = 1_500_000

// ────────────────────────────────────────────────────────────────────────────
// Supabase admin client + OpenAI lazy init
// ────────────────────────────────────────────────────────────────────────────
function createServerClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

let openaiInstance: OpenAI | null = null
function getOpenAI() {
  if (!openaiInstance) openaiInstance = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return openaiInstance
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────
function safeJsonParse<T = any>(raw: string, fallback: T): T {
  try {
    const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
    return JSON.parse(cleaned)
  } catch {
    return fallback
  }
}

function chunkText(text: string, size: number, overlap: number): string[] {
  if (text.length <= size) return [text]
  const chunks: string[] = []
  let i = 0
  while (i < text.length) {
    const end = Math.min(i + size, text.length)
    chunks.push(text.slice(i, end))
    if (end >= text.length) break
    i = end - overlap
  }
  return chunks
}

function normaliseForDedup(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[\u2018\u2019\u201C\u201D]/g, "'")
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim()
}

interface ExtractedQuestion {
  clean_number?: number
  original_question: string
  rewritten_question: string
  theme: string
  original_number: string | null
  confidence: number
}

interface RawCard {
  card_type?: 'basic' | 'cloze' | 'definition'
  front: string
  back: string
  hint?: string | null
  tags?: string[]
  theme?: string
  source_page?: number
}

function normaliseCardsForDb(
  rawCards: RawCard[],
  deckId: string,
  userId: string,
  fallbackPage: number
): any[] {
  return (rawCards || [])
    .map((c) => ({
      deck_id: deckId,
      user_id: userId,
      card_type: ['basic', 'cloze', 'definition'].includes(c.card_type as string)
        ? c.card_type
        : 'basic',
      front: String(c.front || '').trim(),
      back: String(c.back || '').trim(),
      hint: c.hint ? String(c.hint).trim() : null,
      tags: Array.isArray(c.tags) ? c.tags.filter(Boolean).map(String) : [],
      source_page: typeof c.source_page === 'number' ? c.source_page : fallbackPage,
    }))
    .filter((c) => c.front && c.back)
}

// Theme normalisation for grouping into sub-decks
function normaliseTheme(t: string | null | undefined): string {
  const v = (t || '').trim()
  if (!v) return 'Misc'
  // Title-case lightly: "anatomy" → "Anatomy", "ww2 chronology" → "Ww2 chronology"
  return v.charAt(0).toUpperCase() + v.slice(1)
}

// ────────────────────────────────────────────────────────────────────────────
// Phase 1 — extract real questions from a possibly long, noisy text.
// Uses Phase 0 hints (expected count, themes) when available so each chunk
// knows how many questions to aim for and which themes to reuse.
// ────────────────────────────────────────────────────────────────────────────
async function extractQuestionsFromText(
  text: string,
  customInstructions?: string | null,
  context?: { expectedCount?: number | null; themes?: string[] }
): Promise<ExtractedQuestion[]> {
  const openai = getOpenAI()
  const trimmed = text.trim().slice(0, MAX_INPUT_CHARS)
  const chunks = chunkText(trimmed, EXTRACTION_CHUNK_CHARS, EXTRACTION_CHUNK_OVERLAP)

  const all: ExtractedQuestion[] = []

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    console.log(`[Flashcards/Phase1] Chunk ${i + 1}/${chunks.length} (${chunk.length} chars)`)

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 16000, // gpt-4o max output — required for chunks with 100+ questions
        temperature: 0.0,  // fully deterministic for extraction
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: QUESTION_EXTRACTION_SYSTEM_PROMPT },
          {
            role: 'user',
            content: createQuestionExtractionPrompt(chunk, customInstructions, {
              expectedCount: context?.expectedCount ?? null,
              chunkIndex: i,
              totalChunks: chunks.length,
              knownThemes: context?.themes ?? [],
            }),
          },
        ],
      })

      const finishReason = response.choices[0]?.finish_reason
      const raw = response.choices[0]?.message?.content || ''
      if (finishReason === 'length') {
        console.warn(`[Flashcards/Phase1] Chunk ${i + 1} hit token limit (length); JSON may be truncated`)
      }
      const parsed = safeJsonParse<{ questions: ExtractedQuestion[] }>(raw, { questions: [] })
      const list = Array.isArray(parsed.questions) ? parsed.questions : []
      console.log(
        `[Flashcards/Phase1] Chunk ${i + 1}: extracted ${list.length} candidate questions (finish_reason=${finishReason})`
      )
      all.push(...list)
    } catch (err: any) {
      console.error(`[Flashcards/Phase1] Chunk ${i + 1} failed:`, err.message)
    }
  }

  // Dedupe with multiple keys to handle overlap-induced duplicates:
  //   1. original_number  (the source's own numbering — most trustworthy)
  //   2. first ~80 chars of the original_question (defends against rewrite drift)
  //   3. full rewritten question
  // Then clamp at MAX_QUESTIONS and assign GLOBAL clean numbering.
  const seenNumbers = new Set<string>()
  const seenOriginalPrefixes = new Set<string>()
  const seenRewritten = new Set<string>()
  const deduped: ExtractedQuestion[] = []
  for (const q of all) {
    const original = String(q.original_question || '').trim()
    const rewritten = String(q.rewritten_question || original).trim()
    if (!rewritten || rewritten.length < 5) continue

    const numKey = (q.original_number || '').toString().trim()
    if (numKey && seenNumbers.has(numKey)) continue

    const originalPrefix = normaliseForDedup(original).slice(0, 80)
    if (originalPrefix.length >= 20 && seenOriginalPrefixes.has(originalPrefix)) continue

    const rewrittenKey = normaliseForDedup(rewritten)
    if (seenRewritten.has(rewrittenKey)) continue

    if (numKey) seenNumbers.add(numKey)
    if (originalPrefix.length >= 20) seenOriginalPrefixes.add(originalPrefix)
    seenRewritten.add(rewrittenKey)

    deduped.push({
      original_question: original || rewritten,
      rewritten_question: rewritten,
      theme: normaliseTheme(q.theme),
      original_number: q.original_number || null,
      confidence: typeof q.confidence === 'number' ? q.confidence : 0.7,
    })
    if (deduped.length >= MAX_QUESTIONS) break
  }

  // If phase 0 told us how many to expect, enforce it as a hard cap on the
  // output of phase 1. We never want to produce MORE cards than the user's
  // detected count — that's where "244 → 449" came from.
  const expected = context?.expectedCount ?? null
  let final = deduped
  if (typeof expected === 'number' && expected > 0 && deduped.length > expected) {
    console.log(
      `[Flashcards/Phase1] Trimming ${deduped.length} → ${expected} to match phase-0 expected count`
    )
    final = deduped.slice(0, expected)
  }

  // Global clean numbering 1..N (overrides anything the model produced)
  final.forEach((q, idx) => {
    q.clean_number = idx + 1
  })

  console.log(`[Flashcards/Phase1] Total unique questions kept: ${final.length}`)
  return final
}

// ────────────────────────────────────────────────────────────────────────────
// Phase 2 — generate detailed answers in small batches for accuracy
// ────────────────────────────────────────────────────────────────────────────
async function generateAnswersForQuestions(
  questions: ExtractedQuestion[],
  sourceText: string,
  customInstructions: string | null | undefined,
  onProgress?: (done: number, total: number) => void
): Promise<RawCard[]> {
  const openai = getOpenAI()
  const trimmedSource = sourceText.trim().slice(0, ANSWER_SOURCE_BUDGET)
  const allCards: RawCard[] = []

  for (let i = 0; i < questions.length; i += ANSWER_BATCH_SIZE) {
    const batch = questions.slice(i, i + ANSWER_BATCH_SIZE)
    console.log(`[Flashcards/Phase2] Batch ${i / ANSWER_BATCH_SIZE + 1}: ${batch.length} questions`)

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 16000,
        temperature: 0.4, // some creativity for memorable phrasing, but still grounded
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: ANSWER_GENERATION_SYSTEM_PROMPT },
          {
            role: 'user',
            content: createAnswerGenerationPrompt(
              trimmedSource,
              batch.map((q) => ({
                clean_number: q.clean_number,
                original_question: q.original_question,
                rewritten_question: q.rewritten_question,
                theme: q.theme,
                original_number: q.original_number,
              })),
              customInstructions
            ),
          },
        ],
      })

      const raw = response.choices[0]?.message?.content || ''
      const parsed = safeJsonParse<{ cards: RawCard[] }>(raw, { cards: [] })
      const rawList = Array.isArray(parsed.cards) ? parsed.cards : []

      // SAFETY: never accept more cards than questions in the batch. If the
      // model returns extras (or fewer), trim/pad accordingly. This is the
      // hard guarantee that "N questions → at most N cards" per batch.
      const list = rawList.slice(0, batch.length)

      // Re-attach theme + clean_number from phase 1, and prepend a Q-tag
      list.forEach((c, idx) => {
        const q = batch[idx]
        if (!q) return
        if (!c.theme) c.theme = q.theme
        const qTag = q.clean_number ? `Q${q.clean_number}` : null
        const existingTags = Array.isArray(c.tags) ? c.tags : []
        if (qTag && !existingTags.includes(qTag)) {
          c.tags = [qTag, ...existingTags]
        }
      })

      allCards.push(...list)
    } catch (err: any) {
      console.error(`[Flashcards/Phase2] Batch failed:`, err.message)
    }

    if (onProgress) onProgress(Math.min(i + ANSWER_BATCH_SIZE, questions.length), questions.length)
  }

  return allCards
}

// ────────────────────────────────────────────────────────────────────────────
// Route
//
// POST /api/flashcards/[id]/generate
// Body — one of:
//   { pages, customInstructions? }                                  ← image-based (PDF)
//   { text, customInstructions?, groupByTheme?: boolean }           ← raw text 2-phase flow
// ────────────────────────────────────────────────────────────────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: deckId } = await params
    const supabase = createServerClient()

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OPENAI_API_KEY is not configured' }, { status: 500 })
    }

    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: deck, error: deckError } = await supabase
      .from('flashcard_decks')
      .select('id, user_id, name, description')
      .eq('id', deckId)
      .eq('user_id', user.id)
      .single()

    if (deckError || !deck) {
      return NextResponse.json({ error: 'Deck not found' }, { status: 404 })
    }

    const body = await request.json()
    const {
      pages,
      text,
      customInstructions,
      groupByTheme,
      expectedCount,
      themesHint,
    } = body as {
      pages?: Array<{ pageNumber: number; dataUrl: string }>
      text?: string
      customInstructions?: string | null
      groupByTheme?: boolean
      expectedCount?: number | null
      themesHint?: string[] | null
    }

    if ((!pages || pages.length === 0) && (!text || !text.trim())) {
      return NextResponse.json(
        { error: 'Provide either "pages" (image-based) or "text" (raw text) input' },
        { status: 400 }
      )
    }

    const openai = getOpenAI()

    // ──────────────────────────────────────────────────────────────────────
    // PATH A — Raw text input
    //
    //   Step 1: Try the structured-source parser. If the text contains a
    //   recognisable list of cards (CARTE 001, FICHE 12, Card 5, ...) with
    //   paired Q/A, we use them VERBATIM and skip the LLM entirely. This
    //   is what the user wants when they paste pre-formatted cards.
    //
    //   Step 2: Fallback to the 2-phase LLM flow only when no structure is
    //   detected.
    //
    //   Step 3: After all cards exist, optionally consolidate them into
    //   3-10 themed sub-decks.
    // ──────────────────────────────────────────────────────────────────────
    if (text && text.trim()) {
      const sourceText = text.trim().slice(0, MAX_INPUT_CHARS)

      let cards: RawCard[] = []
      let questionsExtractedCount = 0
      let pipelineMode: 'structured' | 'llm-2phase' = 'structured'

      // ── Step 1: Try the deterministic structured parser ────────────
      const structured = parseStructuredCards(sourceText)
      console.log(`[Flashcards] Structured parser found ${structured.length} cards`)

      if (structured.length >= 5) {
        // Use the source verbatim — no LLM rewriting whatsoever.
        questionsExtractedCount = structured.length
        cards = structured.map((s, idx) => ({
          card_type: 'basic' as const,
          front: s.question,
          back: s.answer,
          hint: null,
          tags: [`Q${idx + 1}`, 'from-source'],
          theme: 'Misc', // no theme yet — will be assigned during consolidation if requested
          source_page: 1,
        }))
      } else {
        // ── Step 2: LLM 2-phase fallback for unstructured text ────────
        pipelineMode = 'llm-2phase'

        const questions = await extractQuestionsFromText(sourceText, customInstructions, {
          expectedCount: typeof expectedCount === 'number' ? expectedCount : null,
          themes: Array.isArray(themesHint) ? themesHint : [],
        })

        if (questions.length === 0) {
          return NextResponse.json(
            {
              error: 'No real study questions could be identified in the text. Try pasting a clearer list of questions or a richer source document.',
              phase: 1,
            },
            { status: 422 }
          )
        }

        const llmCards = await generateAnswersForQuestions(questions, sourceText, customInstructions)
        if (llmCards.length === 0) {
          return NextResponse.json(
            { error: 'Questions were identified but no answers could be generated.', phase: 2 },
            { status: 422 }
          )
        }

        questionsExtractedCount = questions.length

        // Hard-cap the LLM card count to the number of questions we extracted.
        // This is the safety net for the "449 cards from 244 questions" bug:
        // if the model batches drift and produce extra cards, we trim them.
        cards = llmCards.slice(0, questions.length)
      }

      // ── Step 3: Theme consolidation (if requested) ──────────────────
      if (groupByTheme && cards.length > 0) {
        try {
          const grouping: CardForGrouping[] = cards.map((c, idx) => ({
            index: idx,
            front: c.front,
            theme: c.theme,
          }))
          const buckets = await consolidateThemes(openai, grouping)
          // Apply the consolidated theme back to each card
          for (const b of buckets) {
            for (const idx of b.card_indices) {
              if (cards[idx]) cards[idx].theme = b.theme
            }
          }
          console.log(
            `[Flashcards] Theme consolidation: ${buckets.length} bucket(s) — ${buckets
              .map((b) => `${b.theme}(${b.card_indices.length})`)
              .join(', ')}`
          )
        } catch (err: any) {
          console.error('[Flashcards] Theme consolidation failed; falling back to single deck:', err.message)
        }
      }

      // ── Step 4: Persist to DB ───────────────────────────────────────
      if (groupByTheme && cards.length > 0) {
        // Group cards by their (consolidated) theme
        const groups = new Map<string, RawCard[]>()
        for (const c of cards) {
          const key = normaliseTheme(c.theme)
          if (!groups.has(key)) groups.set(key, [])
          groups.get(key)!.push(c)
        }

        // Order: largest first, then alphabetical
        const orderedThemes = [...groups.entries()].sort((a, b) => {
          if (b[1].length !== a[1].length) return b[1].length - a[1].length
          return a[0].localeCompare(b[0])
        })

        const baseName = deck.name
        const totalDecks = orderedThemes.length
        const padWidth = String(totalDecks).length
        const createdDecks: Array<{ id: string; name: string; cardsCount: number }> = []

        for (let i = 0; i < orderedThemes.length; i++) {
          const [theme, themeCards] = orderedThemes[i]
          const num = String(i + 1).padStart(padWidth, '0')
          const newName = totalDecks === 1
            ? `${baseName} — ${theme}`
            : `${baseName} — ${num} — ${theme}`

          let targetDeckId: string

          if (i === 0) {
            const { error: renameError } = await supabase
              .from('flashcard_decks')
              .update({
                name: newName,
                description: deck.description
                  ? `${deck.description} • ${theme}`
                  : `Theme: ${theme}`,
              })
              .eq('id', deckId)
              .eq('user_id', user.id)
            if (renameError) {
              console.error('[Flashcards] Failed to rename primary deck:', renameError)
            }
            targetDeckId = deckId
          } else {
            const { data: newDeck, error: createError } = await supabase
              .from('flashcard_decks')
              .insert({
                user_id: user.id,
                name: newName,
                description: deck.description
                  ? `${deck.description} • ${theme}`
                  : `Theme: ${theme}`,
                source_pdf_name: null,
              })
              .select('id, name')
              .single()
            if (createError || !newDeck) {
              console.error('[Flashcards] Failed to create sibling deck:', createError)
              continue
            }
            targetDeckId = newDeck.id
          }

          const dbCards = normaliseCardsForDb(themeCards, targetDeckId, user.id, 1)
          if (dbCards.length === 0) continue

          const { data: inserted, error: insertError } = await supabase
            .from('flashcard_cards')
            .insert(dbCards)
            .select('id')
          if (insertError) {
            console.error('[Flashcards] Insert failed for theme', theme, insertError)
            continue
          }

          await supabase
            .from('flashcard_decks')
            .update({
              total_cards: dbCards.length,
              new_count: dbCards.length,
            })
            .eq('id', targetDeckId)

          createdDecks.push({
            id: targetDeckId,
            name: newName,
            cardsCount: inserted?.length ?? dbCards.length,
          })
        }

        const totalCards = createdDecks.reduce((s, d) => s + d.cardsCount, 0)

        return NextResponse.json({
          mode: 'themed',
          pipeline: pipelineMode,
          decks: createdDecks,
          questionsExtracted: questionsExtractedCount,
          cardsCreated: totalCards,
          deckId,
          cards: [],
        })
      }

      // ── Single-deck mode (no theme grouping) ────────────────────────
      const dbCards = normaliseCardsForDb(cards, deckId, user.id, 1)
      const { data: insertedCards, error: insertError } = await supabase
        .from('flashcard_cards')
        .insert(dbCards)
        .select()

      if (insertError || !insertedCards) {
        console.error('[Flashcards] Insert error:', insertError)
        return NextResponse.json(
          { error: insertError?.message || 'Failed to save cards' },
          { status: 500 }
        )
      }

      const { data: currentDeck } = await supabase
        .from('flashcard_decks')
        .select('total_cards, new_count')
        .eq('id', deckId)
        .single()

      await supabase
        .from('flashcard_decks')
        .update({
          total_cards: (currentDeck?.total_cards || 0) + insertedCards.length,
          new_count: (currentDeck?.new_count || 0) + insertedCards.length,
        })
        .eq('id', deckId)

      return NextResponse.json({
        mode: 'single',
        pipeline: pipelineMode,
        deckId,
        questionsExtracted: questionsExtractedCount,
        cardsCreated: insertedCards.length,
        cards: insertedCards,
      })
    }

    // ──────────────────────────────────────────────────────────────────────
    // PATH B — Image-based pages (unchanged single-shot per page flow)
    // ──────────────────────────────────────────────────────────────────────
    const allCards: any[] = []
    if (pages && pages.length > 0) {
      for (const page of pages) {
        try {
          console.log(`[Flashcards] Generating cards for page ${page.pageNumber}...`)
          const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            max_tokens: 4096,
            messages: [
              { role: 'system', content: FLASHCARD_GENERATION_SYSTEM_PROMPT },
              {
                role: 'user',
                content: [
                  { type: 'text', text: createFlashcardUserPrompt(page.pageNumber, customInstructions) },
                  { type: 'image_url', image_url: { url: page.dataUrl, detail: 'high' } },
                ],
              },
            ],
          })

          const raw = response.choices[0]?.message?.content || ''
          const parsed = safeJsonParse<{ cards: RawCard[] }>(raw, { cards: [] })
          const cards = normaliseCardsForDb(parsed.cards || [], deckId, user.id, page.pageNumber)
          allCards.push(...cards)
        } catch (pageErr: any) {
          console.error(`[Flashcards] Error on page ${page.pageNumber}:`, pageErr.message)
        }
      }
    }

    if (allCards.length === 0) {
      return NextResponse.json(
        { error: 'No cards could be generated from the provided input' },
        { status: 422 }
      )
    }

    const { data: insertedCards, error: insertError } = await supabase
      .from('flashcard_cards')
      .insert(allCards)
      .select()

    if (insertError || !insertedCards) {
      console.error('[Flashcards] Insert error:', insertError)
      return NextResponse.json(
        { error: insertError?.message || 'Failed to save cards' },
        { status: 500 }
      )
    }

    const { data: currentDeck } = await supabase
      .from('flashcard_decks')
      .select('total_cards, new_count')
      .eq('id', deckId)
      .single()

    await supabase
      .from('flashcard_decks')
      .update({
        total_cards: (currentDeck?.total_cards || 0) + insertedCards.length,
        new_count: (currentDeck?.new_count || 0) + insertedCards.length,
      })
      .eq('id', deckId)

    return NextResponse.json({
      mode: 'pdf',
      deckId,
      cardsCreated: insertedCards.length,
      cards: insertedCards,
    })
  } catch (err: any) {
    console.error('[Flashcards] Generate error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
