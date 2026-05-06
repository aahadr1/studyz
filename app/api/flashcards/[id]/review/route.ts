import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { ReviewQuality, SM2Result } from '@/types/flashcard'

export const runtime = 'nodejs'

function createServerClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * SM-2 algorithm
 * quality: 0=Again, 1=Hard, 2=Hard+, 3=Good, 4=Easy, 5=Perfect
 */
function sm2(
  quality: ReviewQuality,
  repetitions: number,
  easeFactor: number,
  interval: number
): SM2Result {
  let newInterval: number
  let newRepetitions: number
  let newEaseFactor: number

  if (quality >= 3) {
    if (repetitions === 0) newInterval = 1
    else if (repetitions === 1) newInterval = 6
    else newInterval = Math.round(interval * easeFactor)

    newRepetitions = repetitions + 1
    newEaseFactor = Math.max(
      1.3,
      easeFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)
    )
  } else {
    newInterval = 1
    newRepetitions = 0
    newEaseFactor = Math.max(1.3, easeFactor - 0.2)
  }

  const dueDate = new Date()
  dueDate.setDate(dueDate.getDate() + newInterval)

  return {
    interval: newInterval,
    easeFactor: Number(newEaseFactor.toFixed(4)),
    repetitions: newRepetitions,
    dueDate: dueDate.toISOString(),
  }
}

// POST /api/flashcards/[id]/review
// Body: { cardId: string, quality: 0|1|2|3|4|5 }
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

    const body = await request.json()
    const { cardId, quality } = body as { cardId: string; quality: ReviewQuality }

    if (!cardId || quality === undefined || quality < 0 || quality > 5) {
      return NextResponse.json({ error: 'cardId and quality (0-5) are required' }, { status: 400 })
    }

    // Verify the card belongs to this deck and user
    const { data: card } = await supabase
      .from('flashcard_cards')
      .select('id')
      .eq('id', cardId)
      .eq('deck_id', deckId)
      .eq('user_id', user.id)
      .single()

    if (!card) return NextResponse.json({ error: 'Card not found' }, { status: 404 })

    // Get existing review state (if any)
    const { data: existing } = await supabase
      .from('flashcard_reviews')
      .select('*')
      .eq('card_id', cardId)
      .eq('user_id', user.id)
      .single()

    const currentInterval = existing?.interval ?? 0
    const currentEF = existing?.ease_factor ?? 2.5
    const currentReps = existing?.repetitions ?? 0

    const result = sm2(quality as ReviewQuality, currentReps, currentEF, currentInterval)

    const reviewData = {
      card_id: cardId,
      user_id: user.id,
      interval: result.interval,
      ease_factor: result.easeFactor,
      repetitions: result.repetitions,
      due_date: result.dueDate,
      last_quality: quality,
    }

    let savedReview
    if (existing) {
      const { data } = await supabase
        .from('flashcard_reviews')
        .update(reviewData)
        .eq('id', existing.id)
        .select()
        .single()
      savedReview = data
    } else {
      const { data } = await supabase
        .from('flashcard_reviews')
        .insert(reviewData)
        .select()
        .single()
      savedReview = data
    }

    // Recompute due_count and new_count for the deck
    const now = new Date().toISOString()

    const { count: dueCount } = await supabase
      .from('flashcard_cards')
      .select('id', { count: 'exact', head: true })
      .eq('deck_id', deckId)
      .eq('user_id', user.id)
      // Join-like: only cards that have a review with due_date <= now
      // We use a subquery via rpc or just update from the deck side
      // For simplicity, we count via flashcard_reviews
    // Counts via separate queries
    const { data: allCards } = await supabase
      .from('flashcard_cards')
      .select('id')
      .eq('deck_id', deckId)
      .eq('user_id', user.id)

    const cardIds = (allCards || []).map((c: any) => c.id)

    const { data: dueReviews } = await supabase
      .from('flashcard_reviews')
      .select('card_id')
      .in('card_id', cardIds.length > 0 ? cardIds : ['00000000-0000-0000-0000-000000000000'])
      .eq('user_id', user.id)
      .lte('due_date', now)

    const { data: reviewedCards } = await supabase
      .from('flashcard_reviews')
      .select('card_id')
      .in('card_id', cardIds.length > 0 ? cardIds : ['00000000-0000-0000-0000-000000000000'])
      .eq('user_id', user.id)

    const reviewedIds = new Set((reviewedCards || []).map((r: any) => r.card_id))
    const newCardsCount = cardIds.filter((id: string) => !reviewedIds.has(id)).length

    await supabase
      .from('flashcard_decks')
      .update({
        due_count: (dueReviews || []).length + newCardsCount,
        new_count: newCardsCount,
      })
      .eq('id', deckId)

    return NextResponse.json({ review: savedReview, sm2: result })
  } catch (err: any) {
    console.error('[Flashcards Review] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
