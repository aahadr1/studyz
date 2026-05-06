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

// PATCH /api/flashcards/[id]/cards/[cardId] — edit a card
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; cardId: string }> }
) {
  try {
    const { id: deckId, cardId } = await params
    const supabase = createServerClient()
    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const updates: Record<string, any> = {}
    if (body.front !== undefined) updates.front = body.front.trim()
    if (body.back !== undefined) updates.back = body.back.trim()
    if (body.hint !== undefined) updates.hint = body.hint?.trim() || null
    if (body.tags !== undefined) updates.tags = body.tags
    if (body.card_type !== undefined) updates.card_type = body.card_type

    const { data: card, error } = await supabase
      .from('flashcard_cards')
      .update(updates)
      .eq('id', cardId)
      .eq('deck_id', deckId)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error || !card) return NextResponse.json({ error: 'Update failed' }, { status: 500 })
    return NextResponse.json({ card })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE /api/flashcards/[id]/cards/[cardId] — delete a card
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; cardId: string }> }
) {
  try {
    const { id: deckId, cardId } = await params
    const supabase = createServerClient()
    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { error } = await supabase
      .from('flashcard_cards')
      .delete()
      .eq('id', cardId)
      .eq('deck_id', deckId)
      .eq('user_id', user.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Update deck counters
    const { data: currentDeck } = await supabase
      .from('flashcard_decks')
      .select('total_cards')
      .eq('id', deckId)
      .single()

    if (currentDeck) {
      await supabase
        .from('flashcard_decks')
        .update({ total_cards: Math.max(0, currentDeck.total_cards - 1) })
        .eq('id', deckId)
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
