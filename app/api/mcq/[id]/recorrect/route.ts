import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { extractAnswerKeyFromImages } from '@/lib/openai'

export const runtime = 'nodejs'
export const maxDuration = 180
export const dynamic = 'force-dynamic'

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

function normalizeCorrectOptions(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const out = input
    .filter((x) => typeof x === 'string')
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean)

  // Deduplicate preserving order
  const seen = new Set<string>()
  const unique: string[] = []
  for (const x of out) {
    if (seen.has(x)) continue
    seen.add(x)
    unique.push(x)
  }
  return unique
}

function guessContentTypeFromDataUrl(dataUrl: string): string {
  const m = dataUrl.match(/^data:([^;]+);base64,/i)
  return m?.[1] || 'image/png'
}

async function fetchQuestionsOrdered(supabase: ReturnType<typeof createServerClient>, mcqSetId: string) {
  // Prefer stable ordering by (page_number, page_question_index). If page_question_index isn't present in prod yet, fall back.
  const base = supabase
    .from('mcq_questions')
    .select('id, options, correct_options, correct_option, question_type')
    .eq('mcq_set_id', mcqSetId)
    .order('page_number', { ascending: true })

  const tryStable = await base.order('page_question_index', { ascending: true })
  if (!tryStable.error) return tryStable

  const msg = String(tryStable.error?.message || '')
  if (msg.toLowerCase().includes('page_question_index')) {
    return await supabase
      .from('mcq_questions')
      .select('id, options, correct_options, correct_option, question_type, created_at')
      .eq('mcq_set_id', mcqSetId)
      .order('page_number', { ascending: true })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
  }

  return tryStable
}

// POST /api/mcq/[id]/recorrect - Re-apply correct answers based on an uploaded answer-key document
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: mcqSetId } = await params
    const supabase = createServerClient()

    const authHeader = request.headers.get('authorization')
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: mcqSet, error: setError } = await supabase
      .from('mcq_sets')
      .select('id, user_id, name')
      .eq('id', mcqSetId)
      .eq('user_id', user.id)
      .single()

    if (setError || !mcqSet) return NextResponse.json({ error: 'MCQ set not found' }, { status: 404 })

    const body = await request.json()
    const { pages } = body as {
      pages?: Array<{ pageNumber?: number; dataUrl?: string }>
    }

    if (!Array.isArray(pages) || pages.length === 0) {
      return NextResponse.json({ error: 'pages is required' }, { status: 400 })
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'AI is not configured on the server (missing OPENAI_API_KEY)' }, { status: 500 })
    }

    // Upload answer-key page images to storage (so OpenAI can fetch via signed URLs)
    const folder = `${user.id}/${mcqSetId}/answer-key-${Date.now()}`
    const uploaded: Array<{ pageNumber: number; signedUrl: string }> = []

    for (let i = 0; i < pages.length; i++) {
      const p = pages[i]
      const dataUrl = typeof p?.dataUrl === 'string' ? p.dataUrl : ''
      if (!dataUrl) continue

      const pageNumber = typeof p?.pageNumber === 'number' && Number.isFinite(p.pageNumber) ? p.pageNumber : (i + 1)
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl
      const buf = Buffer.from(base64, 'base64')

      const contentType = guessContentTypeFromDataUrl(dataUrl)
      const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'png'
      const storagePath = `${folder}/page-${pageNumber}.${ext}`

      const { error: uploadErr } = await supabase.storage
        .from('mcq-pages')
        .upload(storagePath, buf, { contentType, upsert: true })
      if (uploadErr) {
        return NextResponse.json(
          { error: 'Failed to upload answer key page', details: uploadErr.message },
          { status: 500 }
        )
      }

      const { data: signed } = await supabase.storage
        .from('mcq-pages')
        .createSignedUrl(storagePath, 60 * 10)
      if (!signed?.signedUrl) {
        return NextResponse.json(
          { error: 'Failed to create signed URL for answer key page' },
          { status: 500 }
        )
      }

      uploaded.push({ pageNumber, signedUrl: signed.signedUrl })
    }

    if (uploaded.length === 0) {
      return NextResponse.json({ error: 'No valid pages to process' }, { status: 400 })
    }

    // Extract mapping: question number -> correct option letters
    const extracted = await extractAnswerKeyFromImages(
      uploaded
        .sort((a, b) => a.pageNumber - b.pageNumber)
        .map(p => ({ pageNumber: p.pageNumber, imageUrl: p.signedUrl }))
    )

    const answers = Array.isArray(extracted?.answers) ? extracted.answers : []
    const answerMap = new Map<number, string[]>()
    for (const a of answers) {
      const n = typeof (a as any)?.number === 'number' ? (a as any).number : NaN
      if (!Number.isFinite(n) || n <= 0) continue
      const opts = normalizeCorrectOptions((a as any)?.correctOptions)
      if (opts.length === 0) continue
      answerMap.set(Math.floor(n), opts)
    }

    const { data: questions, error: qErr } = await fetchQuestionsOrdered(supabase, mcqSetId)
    if (qErr) {
      return NextResponse.json({ error: 'Failed to load questions', details: qErr.message }, { status: 500 })
    }
    if (!questions || questions.length === 0) {
      return NextResponse.json({ error: 'No questions found in this set' }, { status: 400 })
    }

    let updated = 0
    let skippedMissing = 0
    let skippedInvalid = 0

    for (let idx = 0; idx < questions.length; idx++) {
      const q = questions[idx] as any
      const number = idx + 1
      const desired = answerMap.get(number)
      if (!desired) {
        skippedMissing++
        continue
      }

      const optionLabels = new Set<string>(
        Array.isArray(q?.options)
          ? q.options
              .map((o: any) => (typeof o?.label === 'string' ? o.label.trim().toUpperCase() : ''))
              .filter(Boolean)
          : []
      )

      const filtered = desired.filter((lbl) => optionLabels.has(lbl))
      if (filtered.length === 0) {
        skippedInvalid++
        continue
      }

      const questionType: 'scq' | 'mcq' = filtered.length > 1 ? 'mcq' : 'scq'
      const primary = filtered[0] || 'A'

      const { error: updErr } = await supabase
        .from('mcq_questions')
        .update({
          question_type: questionType,
          correct_options: filtered,
          correct_option: primary,
          is_corrected: true,
        })
        .eq('id', q.id)
        .eq('mcq_set_id', mcqSetId)

      if (updErr) {
        return NextResponse.json(
          { error: 'Failed to update question answers', details: updErr.message, questionId: q.id, number },
          { status: 500 }
        )
      }

      updated++
    }

    // Mark set as corrected (best-effort)
    await supabase
      .from('mcq_sets')
      .update({ is_corrected: true })
      .eq('id', mcqSetId)

    return NextResponse.json({
      success: true,
      set: { id: mcqSetId, name: mcqSet.name },
      summary: {
        totalQuestions: questions.length,
        extractedAnswers: answerMap.size,
        updated,
        skippedMissing,
        skippedInvalid,
      },
    })
  } catch (error: any) {
    console.error('Recorrect error:', error)
    return NextResponse.json(
      { error: 'Failed to recorrect answers', details: error?.message },
      { status: 500 }
    )
  }
}

