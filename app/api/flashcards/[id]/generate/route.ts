import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import {
  FLASHCARD_GENERATION_SYSTEM_PROMPT,
  createFlashcardUserPrompt,
  createFlashcardTextPrompt,
} from '@/lib/prompts'

export const runtime = 'nodejs'
export const maxDuration = 300

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

function safeJsonParse(raw: string): { cards: any[] } {
  try {
    const jsonStr = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
    return JSON.parse(jsonStr)
  } catch {
    return { cards: [] }
  }
}

function normaliseCards(rawCards: any[], deckId: string, userId: string, sourcePage: number): any[] {
  return (rawCards || [])
    .map((c: any) => ({
      deck_id: deckId,
      user_id: userId,
      card_type: ['basic', 'cloze', 'definition'].includes(c.card_type) ? c.card_type : 'basic',
      front: String(c.front || '').trim(),
      back: String(c.back || '').trim(),
      hint: c.hint ? String(c.hint).trim() : null,
      tags: Array.isArray(c.tags) ? c.tags.map(String) : [],
      source_page: typeof c.source_page === 'number' ? c.source_page : sourcePage,
    }))
    .filter((c: any) => c.front && c.back)
}

// POST /api/flashcards/[id]/generate
// Body — one of:
//   { pages: Array<{ pageNumber, dataUrl }>, customInstructions?: string }
//   { text: string,                          customInstructions?: string }
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

    // Verify deck ownership
    const { data: deck, error: deckError } = await supabase
      .from('flashcard_decks')
      .select('id, user_id, name')
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
    } = body as {
      pages?: Array<{ pageNumber: number; dataUrl: string }>
      text?: string
      customInstructions?: string | null
    }

    if ((!pages || pages.length === 0) && (!text || !text.trim())) {
      return NextResponse.json(
        { error: 'Provide either "pages" (image-based) or "text" (raw text) input' },
        { status: 400 }
      )
    }

    const openai = getOpenAI()
    const allCards: any[] = []

    // ── Path 1: Raw text input ─────────────────────────────────────────
    if (text && text.trim()) {
      // Chunk long text so we don't blow past context windows.
      const MAX_CHARS = 12_000
      const trimmed = text.trim()
      const chunks: string[] = []
      for (let i = 0; i < trimmed.length; i += MAX_CHARS) {
        chunks.push(trimmed.slice(i, i + MAX_CHARS))
      }

      for (let i = 0; i < chunks.length; i++) {
        try {
          console.log(`[Flashcards] Text chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)`)
          const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            max_tokens: 4096,
            messages: [
              { role: 'system', content: FLASHCARD_GENERATION_SYSTEM_PROMPT },
              { role: 'user', content: createFlashcardTextPrompt(chunks[i], customInstructions) },
            ],
            response_format: { type: 'json_object' },
          })

          const raw = response.choices[0]?.message?.content || ''
          const parsed = safeJsonParse(raw)
          const cards = normaliseCards(parsed.cards || [], deckId, user.id, i + 1)
          allCards.push(...cards)
          console.log(`[Flashcards] Chunk ${i + 1}: ${cards.length} cards`)
        } catch (err: any) {
          console.error(`[Flashcards] Error on text chunk ${i + 1}:`, err.message)
        }
      }
    }

    // ── Path 2: Image-based pages ─────────────────────────────────────
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
          const parsed = safeJsonParse(raw)
          const cards = normaliseCards(parsed.cards || [], deckId, user.id, page.pageNumber)
          allCards.push(...cards)
          console.log(`[Flashcards] Page ${page.pageNumber}: ${cards.length} cards`)
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

    // Insert all cards
    const { data: insertedCards, error: insertError } = await supabase
      .from('flashcard_cards')
      .insert(allCards)
      .select()

    if (insertError || !insertedCards) {
      console.error('[Flashcards] Insert error:', insertError)
      return NextResponse.json({ error: insertError?.message || 'Failed to save cards' }, { status: 500 })
    }

    // Update deck total_cards counter
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
      deckId,
      cardsCreated: insertedCards.length,
      cards: insertedCards,
    })
  } catch (err: any) {
    console.error('[Flashcards] Generate error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
