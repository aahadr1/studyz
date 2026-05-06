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

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

// ────────────────────────────────────────────────────────────────────────────
// Tunables — these are intentionally conservative for accuracy.
// ────────────────────────────────────────────────────────────────────────────
const MAX_QUESTIONS = 500
// Phase 1 — extraction
const EXTRACTION_CHUNK_CHARS = 22_000   // chunk size of pasted text per extraction call
const EXTRACTION_CHUNK_OVERLAP = 800    // overlap between consecutive chunks (avoid splitting mid-question)
// Phase 2 — answers
const ANSWER_BATCH_SIZE = 12            // number of questions per answer-generation call (smaller = more accurate)
const ANSWER_SOURCE_BUDGET = 30_000     // max source-text chars sent to phase-2 calls (truncated if larger)
// Hard input cap (server-side safety)
const MAX_INPUT_CHARS = 200_000

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
// Phase 1 — extract real questions from a possibly long, noisy text
// ────────────────────────────────────────────────────────────────────────────
async function extractQuestionsFromText(
  text: string,
  customInstructions?: string | null
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
        max_tokens: 6000,
        temperature: 0.1, // low temp for accurate extraction
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: QUESTION_EXTRACTION_SYSTEM_PROMPT },
          { role: 'user', content: createQuestionExtractionPrompt(chunk, customInstructions) },
        ],
      })

      const raw = response.choices[0]?.message?.content || ''
      const parsed = safeJsonParse<{ questions: ExtractedQuestion[] }>(raw, { questions: [] })
      const list = Array.isArray(parsed.questions) ? parsed.questions : []
      console.log(`[Flashcards/Phase1] Chunk ${i + 1}: extracted ${list.length} candidate questions`)
      all.push(...list)
    } catch (err: any) {
      console.error(`[Flashcards/Phase1] Chunk ${i + 1} failed:`, err.message)
    }
  }

  // Dedupe + sort + clamp at MAX_QUESTIONS
  const seen = new Set<string>()
  const deduped: ExtractedQuestion[] = []
  for (const q of all) {
    const original = String(q.original_question || '').trim()
    const rewritten = String(q.rewritten_question || original).trim()
    if (!rewritten || rewritten.length < 5) continue
    const key = normaliseForDedup(rewritten)
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push({
      original_question: original || rewritten,
      rewritten_question: rewritten,
      theme: normaliseTheme(q.theme),
      original_number: q.original_number || null,
      confidence: typeof q.confidence === 'number' ? q.confidence : 0.7,
    })
    if (deduped.length >= MAX_QUESTIONS) break
  }

  console.log(`[Flashcards/Phase1] Total unique questions kept: ${deduped.length}`)
  return deduped
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
        max_tokens: 6000,
        temperature: 0.4, // some creativity for memorable phrasing, but still grounded
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: ANSWER_GENERATION_SYSTEM_PROMPT },
          {
            role: 'user',
            content: createAnswerGenerationPrompt(
              trimmedSource,
              batch.map((q) => ({
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
      const list = Array.isArray(parsed.cards) ? parsed.cards : []

      // Re-attach the theme that came from phase 1 if the model omitted it
      list.forEach((c, idx) => {
        if (!c.theme && batch[idx]) c.theme = batch[idx].theme
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
    } = body as {
      pages?: Array<{ pageNumber: number; dataUrl: string }>
      text?: string
      customInstructions?: string | null
      groupByTheme?: boolean
    }

    if ((!pages || pages.length === 0) && (!text || !text.trim())) {
      return NextResponse.json(
        { error: 'Provide either "pages" (image-based) or "text" (raw text) input' },
        { status: 400 }
      )
    }

    const openai = getOpenAI()

    // ──────────────────────────────────────────────────────────────────────
    // PATH A — Raw text input (2-phase flow with optional theme grouping)
    // ──────────────────────────────────────────────────────────────────────
    if (text && text.trim()) {
      const sourceText = text.trim().slice(0, MAX_INPUT_CHARS)

      // Phase 1: extract questions
      const questions = await extractQuestionsFromText(sourceText, customInstructions)

      if (questions.length === 0) {
        return NextResponse.json(
          {
            error: 'No real study questions could be identified in the text. Try pasting a clearer list of questions or a richer source document.',
            phase: 1,
          },
          { status: 422 }
        )
      }

      // Phase 2: generate detailed answers in small batches
      const cards = await generateAnswersForQuestions(questions, sourceText, customInstructions)

      if (cards.length === 0) {
        return NextResponse.json(
          { error: 'Questions were identified but no answers could be generated.', phase: 2 },
          { status: 422 }
        )
      }

      // ── Routing: single deck OR multiple themed sub-decks ────────────
      if (groupByTheme) {
        // Group cards by normalised theme
        const groups = new Map<string, RawCard[]>()
        for (const c of cards) {
          const key = normaliseTheme(c.theme)
          if (!groups.has(key)) groups.set(key, [])
          groups.get(key)!.push(c)
        }

        // Stable order: most cards first, then alphabetical
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
            // Reuse the original deck for the first theme — rename it
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
            // Create a sibling deck for the additional themes
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

          // Insert cards for this theme
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

          // Update deck counters
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
          decks: createdDecks,
          questionsExtracted: questions.length,
          cardsCreated: totalCards,
          // Backwards-compat fields
          deckId,
          cards: [],
        })
      }

      // ── Single-deck mode (no theme grouping) ─────────────────────────
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
        deckId,
        questionsExtracted: questions.length,
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
