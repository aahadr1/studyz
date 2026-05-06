import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { FLASHCARD_GENERATION_SYSTEM_PROMPT, createFlashcardUserPrompt } from '@/lib/prompts'

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

// POST /api/flashcards/[id]/generate
// Body: { pages: Array<{ pageNumber: number, dataUrl: string }> }
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
    const { pages } = body as {
      pages: Array<{ pageNumber: number; dataUrl: string }>
    }

    if (!pages || pages.length === 0) {
      return NextResponse.json({ error: 'pages array is required' }, { status: 400 })
    }

    const openai = getOpenAI()
    const allCards: any[] = []

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
                { type: 'text', text: createFlashcardUserPrompt(page.pageNumber) },
                {
                  type: 'image_url',
                  image_url: { url: page.dataUrl, detail: 'high' },
                },
              ],
            },
          ],
        })

        const raw = response.choices[0]?.message?.content || ''
        let parsed: { cards: any[] } = { cards: [] }

        try {
          // Strip markdown code fences if present
          const jsonStr = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
          parsed = JSON.parse(jsonStr)
        } catch {
          console.warn(`[Flashcards] Failed to parse JSON for page ${page.pageNumber}:`, raw.slice(0, 200))
          continue
        }

        const pageCards = (parsed.cards || []).map((c: any) => ({
          deck_id: deckId,
          user_id: user.id,
          card_type: ['basic', 'cloze', 'definition'].includes(c.card_type) ? c.card_type : 'basic',
          front: String(c.front || '').trim(),
          back: String(c.back || '').trim(),
          hint: c.hint ? String(c.hint).trim() : null,
          tags: Array.isArray(c.tags) ? c.tags.map(String) : [],
          source_page: page.pageNumber,
        })).filter((c: any) => c.front && c.back)

        allCards.push(...pageCards)
        console.log(`[Flashcards] Page ${page.pageNumber}: ${pageCards.length} cards generated`)
      } catch (pageErr: any) {
        console.error(`[Flashcards] Error on page ${page.pageNumber}:`, pageErr.message)
        // Continue with other pages
      }
    }

    if (allCards.length === 0) {
      return NextResponse.json({ error: 'No cards could be generated from the provided pages' }, { status: 422 })
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
