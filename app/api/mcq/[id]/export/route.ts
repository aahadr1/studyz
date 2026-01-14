import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import PDFDocument from 'pdfkit'
import { PassThrough, Readable } from 'stream'

export const runtime = 'nodejs'
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

function normalizeCorrectOptions(q: any): string[] {
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
  const { id: mcqSetId } = await params
  const supabase = createServerClient()

  const authHeader = request.headers.get('authorization')
  if (!authHeader) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
    return NextResponse.json({ error: 'MCQ set not found' }, { status: 404 })
  }

  const { data: questions, error: qError } = await supabase
    .from('mcq_questions')
    .select('id, question, options, correct_option, correct_options, question_type, explanation, page_number, page_question_index, created_at')
    .eq('mcq_set_id', mcqSetId)
    .order('page_number', { ascending: true })
    .order('page_question_index', { ascending: true })

  if (qError) {
    return NextResponse.json({ error: 'Failed to load questions' }, { status: 500 })
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
    const questionText = asText(q?.question).trim()
    const options: Array<{ label: string; text: string }> = Array.isArray(q?.options) ? q.options : []
    const correctOptions = normalizeCorrectOptions(q)
    const explanation = asText(q?.explanation).trim()

    // Question
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(12)
    const qLabel = `${qNum}. `
    const qLabelWidth = doc.widthOfString(qLabel)
    const qHeight = doc.heightOfString(questionText || '(empty question)', { width: contentWidth - qLabelWidth })
    ensureSpace(qHeight + 18)
    doc.text(qLabel, { continued: true, width: qLabelWidth })
    doc.font('Helvetica').text(questionText || '(empty question)', { width: contentWidth - qLabelWidth })
    doc.moveDown(0.4)

    // Options
    doc.font('Helvetica').fontSize(11).fillColor('#111827')
    options.forEach((opt) => {
      const label = asText(opt?.label || '').trim() || '?'
      const text = asText(opt?.text || '').trim()
      const bullet = `${label}) `
      const bulletWidth = doc.widthOfString(bullet)
      const optHeight = doc.heightOfString(text || '(empty)', { width: contentWidth - 18 - bulletWidth })
      ensureSpace(optHeight + 6)
      doc.fillColor('#111827').text(' ', doc.page.margins.left, doc.y, { width: 18 })
      doc.fillColor('#111827').font('Helvetica-Bold').text(bullet, doc.page.margins.left + 18, doc.y, {
        continued: true,
        width: bulletWidth,
      })
      doc.font('Helvetica').text(text || '(empty)', {
        width: contentWidth - 18 - bulletWidth,
      })
      doc.moveDown(0.15)
    })

    if (includeAnswers) {
      doc.moveDown(0.2)
      const answerLine = correctOptions.length > 0 ? correctOptions.join(', ') : 'Unknown'
      const answerHeight = doc.heightOfString(`Correct answer(s): ${answerLine}`, { width: contentWidth })
      ensureSpace(answerHeight + 10)
      doc.fillColor('#065F46').font('Helvetica-Bold').fontSize(10).text(`Correct answer(s): ${answerLine}`, {
        width: contentWidth,
      })
      if (explanation) {
        doc.moveDown(0.15)
        doc.fillColor('#374151').font('Helvetica').fontSize(10).text(`Explanation: ${explanation}`, {
          width: contentWidth,
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

  const webStream = Readable.toWeb(pass) as unknown as ReadableStream
  return new NextResponse(webStream, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store, max-age=0',
    },
  })
}

