import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabaseServer'
import { getOpenAI } from '@/lib/openai'

export const runtime = 'nodejs'

export async function POST(
  request: Request,
  { params }: { params: { id: string; pageNum: string } }
) {
  const lessonId = params.id
  const pageNumber = parseInt(params.pageNum)

  try {
    const { pageImage, documentId } = await request.json()

    if (!pageImage || !documentId) {
      return NextResponse.json(
        { error: 'Missing pageImage or documentId' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseServerClient()

    // Check if transcription already exists in DB
    const { data: existingTranscription } = await supabase
      .from('interactive_lesson_page_texts')
      .select('text_content')
      .eq('interactive_lesson_id', lessonId)
      .eq('document_id', documentId)
      .eq('page_number', pageNumber)
      .single()

    if (existingTranscription?.text_content) {
      return NextResponse.json({ transcription: existingTranscription.text_content })
    }

    // If not in DB, call GPT-4o-mini vision to transcribe
    const openai = getOpenAI()

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are an educational AI assistant. Your task is to analyze this page from a lesson document and provide a clear, pedagogical explanation of its content. ' +
            'Explain the main concepts, key points, and any visual elements (diagrams, tables, formulas). ' +
            'Write in a clear, teaching style that helps students understand the material.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Please explain the content of this page from an educational lesson:',
            },
            {
              type: 'image_url',
              image_url: {
                url: pageImage,
              },
            },
          ],
        },
      ],
      max_tokens: 1500,
    })

    const transcription =
      completion.choices[0]?.message?.content || 'Unable to transcribe this page.'

    // Store in database for future use
    await supabase.from('interactive_lesson_page_texts').upsert(
      {
        interactive_lesson_id: lessonId,
        document_id: documentId,
        page_number: pageNumber,
        text_content: transcription,
        transcription_type: 'vision',
      },
      { onConflict: 'interactive_lesson_id,document_id,page_number' }
    )

    return NextResponse.json({ transcription })
  } catch (error: any) {
    console.error('[TRANSCRIBE] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to transcribe page' },
      { status: 500 }
    )
  }
}

