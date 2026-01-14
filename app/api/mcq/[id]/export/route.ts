import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import PDFDocument from 'pdfkit'
import { PassThrough, Readable } from 'stream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function serializeError(err: any) {
  return {
    name: err?.name ?? null,
    message: err?.message ?? String(err ?? ''),
    status: err?.status ?? err?.response?.status ?? null,
    code: err?.code ?? err?.error?.code ?? null,
  }
}

function createServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) throw new Error('Missing env: NEXT_PUBLIC_SUPABASE_URL')
  if (!key) throw new Error('Missing env: SUPABASE_SERVICE_ROLE_KEY')
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function sanitizeFilename(name: string) {
  return (name || 'mcq')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'mcq'
}

function asText(v: any) {
  if (v == null) return ''
  return String(v)
}

function normalizeInlineText(v: any) {
  // Export PDFs should not preserve random newlines from OCR; make it readable.
  // Keep it simple and robust: collapse all whitespace (incl. newlines) to single spaces.
  return asText(v).replace(/\s+/g, ' ').trim()
}

function normalizeCorrectOptions(q: any): string[] {
  // Supabase returns DB column names as-is (snake_case).
  const fromArray = Array.isArray(q?.correct_options) ? q.correct_options : null
  if (fromArray && fromArray.length > 0) return fromArray.map(String)
  if (q?.correct_option) return [String(q.correct_option)]
  return []
}

type ExportMode = 'with_answers' | 'no_answers'

function parseMode(req: NextRequest): ExportMode {
  const mode = (req.nextUrl.searchParams.get('mode') || '').toLowerCase()
  if (mode === 'with_answers' || mode === 'answers' || mode === 'with') return 'with_answers'
  if (mode === 'no_answers' || mode === 'no' || mode === 'without') return 'no_answers'
  return 'with_answers'
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: mcqSetId } = await params
    const supabase = createServerClient()

    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized', details: authError?.message }, { status: 401 })
    }

    const mode = parseMode(request)
    const includeAnswers = mode === 'with_answers'

    const { data: mcqSet, error: setError } = await supabase
      .from('mcq_sets')
      .select('id, user_id, name, created_at')
      .eq('id', mcqSetId)
      .eq('user_id', user.id)
      .single()

    if (setError || !mcqSet) {
      return NextResponse.json({ error: 'MCQ set not found', details: setError?.message }, { status: 404 })
    }

  // Robust ordering: prefer exact document order (page_number, page_question_index) if available,
  // otherwise fall back to a stable order (created_at, id).
  let questions: any[] | null = null
  let qError: any | null = null

  {
    const res = await supabase
      .from('mcq_questions')
      .select('*')
      .eq('mcq_set_id', mcqSetId)
      .order('page_number', { ascending: true })
      .order('page_question_index', { ascending: true })
    questions = (res as any).data ?? null
    qError = (res as any).error ?? null
  }

  if (qError) {
    const msg = String(qError?.message || '').toLowerCase()
    const looksLikeMissingColumn =
      msg.includes('page_question_index') ||
      msg.includes('does not exist') ||
      msg.includes('unknown column') ||
      msg.includes('column')

    if (looksLikeMissingColumn) {
      const fallback = await supabase
        .from('mcq_questions')
        .select('*')
        .eq('mcq_set_id', mcqSetId)
        .order('page_number', { ascending: true })
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
      questions = (fallback as any).data ?? null
      qError = (fallback as any).error ?? null
    }
  }

    if (qError) {
      console.error('MCQ export: failed to load questions', { mcqSetId, qError })
      return NextResponse.json(
        { error: 'Failed to load questions', details: qError?.message || qError },
        { status: 500 }
      )
    }

    const safeName = sanitizeFilename(mcqSet.name || 'mcq')
    const filename = `${safeName}-${includeAnswers ? 'with-answers' : 'no-answers'}.pdf`

  // Create PDF stream (no buffering to memory)
  const pass = new PassThrough()
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 54, bottom: 54, left: 54, right: 54 },
    autoFirstPage: true,
    info: {
      Title: mcqSet.name || 'MCQ Export',
      Author: 'Studyz',
    },
  })
  doc.pipe(pass)

  const pageWidth = doc.page.width
  const contentWidth = pageWidth - doc.page.margins.left - doc.page.margins.right
    const left = doc.page.margins.left

  const ensureSpace = (neededHeight: number) => {
    const bottom = doc.page.height - doc.page.margins.bottom
    if (doc.y + neededHeight > bottom) doc.addPage()
  }

  const writeDivider = () => {
    const y = doc.y
    ensureSpace(14)
    doc
      .moveTo(doc.page.margins.left, y + 6)
      .lineTo(doc.page.margins.left + contentWidth, y + 6)
      .lineWidth(0.5)
      .strokeColor('#E5E7EB')
      .stroke()
    doc.moveDown(1.0)
  }

  // Header
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(18).text(asText(mcqSet.name || 'MCQ Export'), {
    width: contentWidth,
  })
  doc.moveDown(0.25)
  doc.fillColor('#6B7280').font('Helvetica').fontSize(10).text(
    `Questions: ${(questions || []).length} • Export: ${includeAnswers ? 'With answers' : 'Without answers'}`,
    { width: contentWidth }
  )
  doc.moveDown(0.75)
  writeDivider()

  const qs = Array.isArray(questions) ? questions : []

  qs.forEach((q: any, idx: number) => {
    const qNum = idx + 1
      const questionText = normalizeInlineText(q?.question)
    const options: Array<{ label: string; text: string }> = Array.isArray(q?.options) ? q.options : []
    const correctOptions = normalizeCorrectOptions(q)
      const explanation = normalizeInlineText(q?.explanation)

      // Question (render label and body in separate boxes; avoid `continued` to prevent tiny-width wrapping)
      doc.fillColor('#111827').fontSize(12)
      const label = `${qNum}.`
      doc.font('Helvetica-Bold')
      const labelWidth = Math.max(18, doc.widthOfString(label + ' ') + 2)
      const bodyX = left + labelWidth
      const bodyWidth = Math.max(50, contentWidth - labelWidth)
      const qBody = questionText || '(empty question)'
      const qHeight = doc.heightOfString(qBody, { width: bodyWidth, lineGap: 2 })
      ensureSpace(qHeight + 18)
      const y0 = doc.y
      doc.text(label, left, y0, { width: labelWidth, lineGap: 2 })
      doc.font('Helvetica').text(qBody, bodyX, y0, { width: bodyWidth, lineGap: 2 })
      doc.y = y0 + qHeight
      doc.moveDown(0.45)

    // Options
      doc.fontSize(11).fillColor('#111827')
    options.forEach((opt) => {
        const optLabel = normalizeInlineText(opt?.label) || '?'
        const optText = normalizeInlineText(opt?.text) || '(empty)'
        const indent = 18
        doc.font('Helvetica-Bold')
        const bullet = `${optLabel})`
        const bulletWidth = Math.max(16, doc.widthOfString(bullet + ' ') + 2)
        const textX = left + indent + bulletWidth
        const textWidth = Math.max(50, contentWidth - indent - bulletWidth)
        const optHeight = doc.heightOfString(optText, { width: textWidth, lineGap: 2 })
        ensureSpace(optHeight + 8)
        const y = doc.y
        doc.text(bullet, left + indent, y, { width: bulletWidth, lineGap: 2 })
        doc.font('Helvetica').text(optText, textX, y, { width: textWidth, lineGap: 2 })
        doc.y = y + optHeight
        doc.moveDown(0.15)
    })

    if (includeAnswers) {
      doc.moveDown(0.2)
      const answerLine = correctOptions.length > 0 ? correctOptions.join(', ') : 'Unknown'
        const answerHeight = doc.heightOfString(`Correct answer(s): ${answerLine}`, { width: contentWidth, lineGap: 2 })
      ensureSpace(answerHeight + 10)
      doc.fillColor('#065F46').font('Helvetica-Bold').fontSize(10).text(`Correct answer(s): ${answerLine}`, {
        width: contentWidth,
          lineGap: 2,
      })
      if (explanation) {
        doc.moveDown(0.15)
          doc.fillColor('#374151').font('Helvetica').fontSize(10).text(`Explanation: ${explanation}`, {
          width: contentWidth,
            lineGap: 2,
        })
      }
    }

    doc.moveDown(0.8)
    if (idx !== qs.length - 1) writeDivider()
  })

  // Footer note
  doc.addPage()
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(14).text('Notes', { width: contentWidth })
  doc.moveDown(0.5)
  doc.fillColor('#6B7280').font('Helvetica').fontSize(10).text(
    'Generated by Studyz. If you exported without answers, use this PDF as a practice sheet.',
    { width: contentWidth }
  )

  doc.end()

    // Convert Node stream -> Web stream (Node runtime only)
    const webStream = Readable.toWeb(pass) as unknown as ReadableStream
    return new NextResponse(webStream, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, max-age=0',
      },
    })
  } catch (err: any) {
    console.error('MCQ export: unhandled error', err)
    return NextResponse.json(
      { error: 'Export failed', details: serializeError(err) },
      { status: 500 }
    )
  }
}

