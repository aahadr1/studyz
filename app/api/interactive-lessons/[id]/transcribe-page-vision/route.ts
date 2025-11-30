import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabaseServer'
import { getOpenAI } from '@/lib/openai'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: lessonId } = await params

  try {
    const { pageNumber, pageImage, documentId } = await request.json()

    if (!pageNumber || !pageImage || !documentId) {
      return NextResponse.json(
        { error: 'Missing required fields: pageNumber, pageImage, documentId' },
        { status: 400 }
      )
    }

    console.log(`[TRANSCRIBE-PAGE] Processing page ${pageNumber} for lesson ${lessonId}`)

    const openai = getOpenAI()

    // Call GPT-4o-mini vision with the page image
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Tu es un expert en transcription de documents pédagogiques. Tu dois extraire tout le texte visible dans cette image de page de document, en préservant la structure et les sauts de ligne. Décris aussi brièvement les éléments visuels importants (diagrammes, tableaux, images, formules) s\'il y en a.'
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Transcris cette page ${pageNumber} de document pédagogique en français :`
            },
            {
              type: 'image_url',
              image_url: {
                url: pageImage, // Already in base64 format from client
                detail: 'high'
              }
            }
          ]
        }
      ],
      max_tokens: 4000
    })

    const transcription = completion.choices[0]?.message?.content || ''

    if (!transcription) {
      throw new Error('No transcription received from AI')
    }

    // Save transcription to database
    const supabase = getSupabaseServerClient()
    const { error: saveError } = await (supabase as any)
      .from('interactive_lesson_page_texts')
      .upsert({
        document_id: documentId,
        page_number: pageNumber,
        text_content: transcription,
        transcription_type: 'vision',
        has_visual_content: transcription.toLowerCase().includes('diagramme') || 
                           transcription.toLowerCase().includes('tableau') || 
                           transcription.toLowerCase().includes('image') ||
                           transcription.toLowerCase().includes('formule')
      }, { onConflict: 'document_id,page_number' })

    if (saveError) {
      console.error(`[TRANSCRIBE-PAGE] Error saving transcription:`, saveError)
      throw new Error(`Failed to save transcription: ${saveError.message}`)
    }

    console.log(`[TRANSCRIBE-PAGE] ✓ Page ${pageNumber} transcribed: ${transcription.length} chars`)

    return NextResponse.json({
      success: true,
      pageNumber,
      transcription,
      length: transcription.length
    })

  } catch (error: any) {
    console.error(`[TRANSCRIBE-PAGE] Error:`, error)
    return NextResponse.json(
      { error: error.message || 'Failed to transcribe page' },
      { status: 500 }
    )
  }
}

