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

function getUser(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return null
  return token
}

// GET /api/flashcards — list all decks for the authenticated user
export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient()
    const token = getUser(request)
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: decks, error } = await supabase
      .from('flashcard_decks')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[Flashcards] List error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ decks: decks || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST /api/flashcards — create a new deck
export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient()
    const token = getUser(request)
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { name, description, source_pdf_name } = body as {
      name: string
      description?: string
      source_pdf_name?: string
    }

    if (!name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const { data: deck, error } = await supabase
      .from('flashcard_decks')
      .insert({
        user_id: user.id,
        name: name.trim(),
        description: description?.trim() || null,
        source_pdf_name: source_pdf_name || null,
      })
      .select()
      .single()

    if (error || !deck) {
      console.error('[Flashcards] Create error:', error)
      return NextResponse.json({ error: error?.message || 'Failed to create deck' }, { status: 500 })
    }

    return NextResponse.json({ deck })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
