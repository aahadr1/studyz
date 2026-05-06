import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function createServerClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET /api/flashcards/[id]/due
// Returns: new cards (never reviewed) + cards whose due_date <= now
// Query params: ?limit=20&includeNew=true
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

    const url = new URL(request.url)
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100)
    const includeNew = url.searchParams.get('includeNew') !== 'false'
    const now = new Date().toISOString()

    // Get all cards for the deck
    const { data: allCards, error: cardsError } = await supabase
      .from('flashcard_cards')
      .select('*, review:flashcard_reviews(*)')
      .eq('deck_id', deckId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })

    if (cardsError) return NextResponse.json({ error: cardsError.message }, { status: 500 })

    const cards = (allCards || []).map((c: any) => ({
      ...c,
      review: Array.isArray(c.review) ? (c.review[0] ?? null) : (c.review ?? null),
    }))

    // Separate into new (no review) and due (review.due_date <= now)
    const newCards = includeNew
      ? cards.filter((c: any) => !c.review)
      : []

    const dueCards = cards.filter(
      (c: any) => c.review && c.review.due_date <= now
    )

    // Sort due cards by due_date ascending (most overdue first)
    dueCards.sort((a: any, b: any) =>
      new Date(a.review.due_date).getTime() - new Date(b.review.due_date).getTime()
    )

    // Combine: due first, then new, up to limit
    const sessionCards = [...dueCards, ...newCards].slice(0, limit)

    return NextResponse.json({
      cards: sessionCards,
      stats: {
        total: cards.length,
        new: newCards.length,
        due: dueCards.length,
        learned: cards.length - newCards.length,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
