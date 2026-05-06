import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

function normalizeText(input: unknown): string {
  if (typeof input !== 'string') return ''
  return input
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function normalizeOptionLabel(input: unknown): string {
  if (typeof input !== 'string') return ''
  return input.trim().toUpperCase()
}

function normalizeStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return input
    .filter((x) => typeof x === 'string')
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean)
}

// Create a Supabase client with service role for server-side operations
function createServerClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}

// POST /api/mcq/[id]/deduplicate - Deduplicate and merge MCQs after all pages are processed
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: mcqSetId } = await params
    const supabase = createServerClient()
    
    // Get user from auth header
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify MCQ set ownership
    const { data: mcqSet, error: setError } = await supabase
      .from('mcq_sets')
      .select('id, user_id')
      .eq('id', mcqSetId)
      .eq('user_id', user.id)
      .single()

    if (setError || !mcqSet) {
      return NextResponse.json({ error: 'MCQ set not found' }, { status: 404 })
    }

    // Get all questions for this MCQ set
    const { data: questions, error: questionsError } = await supabase
      .from('mcq_questions')
      .select('*')
      .eq('mcq_set_id', mcqSetId)
      .order('page_number', { ascending: true })
      .order('page_question_index', { ascending: true })

    if (questionsError) {
      return NextResponse.json({ error: 'Failed to fetch questions' }, { status: 500 })
    }

    if (!questions || questions.length <= 1) {
      return NextResponse.json({ 
        message: 'No deduplication needed',
        originalCount: questions?.length || 0,
        finalCount: questions?.length || 0,
        duplicatesRemoved: 0
      })
    }

    console.log(`Deduplicating ${questions.length} questions for MCQ set ${mcqSetId} (STRICT exact-match only)`)

    type Row = any

    const keyToKeepId = new Map<string, string>()
    const duplicateIds: string[] = []
    const updatesToApply: Array<{ id: string; update: Record<string, any> }> = []

    for (const q of questions as Row[]) {
      const questionType: 'scq' | 'mcq' =
        q.question_type === 'mcq' || (Array.isArray(q.correct_options) && q.correct_options.length > 1) ? 'mcq' : 'scq'

      const correctOptions = (Array.isArray(q.correct_options) && q.correct_options.length > 0)
        ? normalizeStringArray(q.correct_options)
        : normalizeStringArray(q.correct_option ? [q.correct_option] : [])

      const opts = Array.isArray(q.options) ? q.options : []
      const normalizedOptions = opts.map((o: any) => ({
        label: normalizeOptionLabel(o?.label),
        text: normalizeText(o?.text),
      }))

      // Exact-match key (question + options + correctOptions + questionType)
      const key = JSON.stringify({
        t: questionType,
        q: normalizeText(q.question),
        o: normalizedOptions,
        c: correctOptions,
      })

      const existingKeepId = keyToKeepId.get(key)
      if (!existingKeepId) {
        keyToKeepId.set(key, q.id)
        continue
      }

      // Perfect duplicate: mark for deletion, but first try to preserve "best" fields on the kept row
      duplicateIds.push(q.id)

      const kept = (questions as Row[]).find((x) => x.id === existingKeepId)
      if (kept) {
        const update: Record<string, any> = {}
        if (!kept.explanation && q.explanation) update.explanation = q.explanation
        if (!kept.lesson_card && q.lesson_card) update.lesson_card = q.lesson_card
        if (!kept.section_id && q.section_id) update.section_id = q.section_id
        if (Object.keys(update).length > 0) {
          updatesToApply.push({ id: kept.id, update })
          Object.assign(kept, update)
        }
      }
    }

    const originalCount = questions.length
    const duplicatesRemoved = duplicateIds.length
    const finalCount = originalCount - duplicatesRemoved

    if (duplicatesRemoved > 0) {
      // Apply any enrichment updates to kept rows (best-effort)
      for (const u of updatesToApply) {
        await supabase
          .from('mcq_questions')
          .update(u.update)
          .eq('id', u.id)
          .eq('mcq_set_id', mcqSetId)
      }

      // Delete only the exact duplicates (keep variants!)
      const { error: deleteError } = await supabase
        .from('mcq_questions')
        .delete()
        .in('id', duplicateIds)

      if (deleteError) {
        console.error('Error deleting duplicates:', deleteError)
        return NextResponse.json({ error: 'Failed to delete duplicates' }, { status: 500 })
      }

      await supabase
        .from('mcq_sets')
        .update({ total_questions: finalCount })
        .eq('id', mcqSetId)

      console.log(`Strict dedup complete: ${originalCount} -> ${finalCount} questions`)
    }

    return NextResponse.json({
      message: duplicatesRemoved > 0 
        ? `Removed ${duplicatesRemoved} duplicate(s)` 
        : 'No duplicates found',
      originalCount,
      finalCount,
      duplicatesRemoved
    })
  } catch (error: any) {
    console.error('MCQ deduplication error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error?.message
    }, { status: 500 })
  }
}

