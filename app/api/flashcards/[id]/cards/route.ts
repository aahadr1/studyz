import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

function createServerClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET /api/flashcards/[id]/cards — list cards for a deck
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: deckId } = await params
    const supabase = createServerClient()
    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: cards, error } = await supabase
      .from('flashcard_cards')
      .select('*, review:flashcard_reviews(*)')
      .eq('deck_id', deckId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const normalised = (cards || []).map((c: any) => ({
      ...c,
      review: Array.isArray(c.review) ? (c.review[0] ?? null) : (c.review ?? null),
    }))

    return NextResponse.json({ cards: normalised })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST /api/flashcards/[id]/cards — create a card manually
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: deckId } = await params
    const supabase = createServerClient()
    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Verify ownership
    const { data: deck } = await supabase
      .from('flashcard_decks')
      .select('id')
      .eq('id', deckId)
      .eq('user_id', user.id)
      .single()

    if (!deck) return NextResponse.json({ error: 'Deck not found' }, { status: 404 })

    const body = await request.json()
    const { card_type = 'basic', front, back, hint, tags = [], source_page } = body

    if (!front?.trim() || !back?.trim()) {
      return NextResponse.json({ error: 'front and back are required' }, { status: 400 })
    }

    const { data: card, error } = await supabase
      .from('flashcard_cards')
      .insert({
        deck_id: deckId,
        user_id: user.id,
        card_type,
        front: front.trim(),
        back: back.trim(),
        hint: hint?.trim() || null,
        tags: Array.isArray(tags) ? tags : [],
        source_page: source_page || null,
      })
      .select()
      .single()

    if (error || !card) return NextResponse.json({ error: error?.message || 'Failed to create card' }, { status: 500 })

    // Update deck counters
    const { data: currentDeck } = await supabase
      .from('flashcard_decks')
      .select('total_cards, new_count')
      .eq('id', deckId)
      .single()

    await supabase
      .from('flashcard_decks')
      .update({
        total_cards: (currentDeck?.total_cards || 0) + 1,
        new_count: (currentDeck?.new_count || 0) + 1,
      })
      .eq('id', deckId)

    return NextResponse.json({ card })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
