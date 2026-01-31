import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { extractAndAnalyze } from '@/lib/intelligent-podcast/extractor'
import { generateIntelligentScript } from '@/lib/intelligent-podcast/script-generator'
import { generateMultiVoiceAudio, generatePredictedQuestionsAudio } from '@/lib/intelligent-podcast/audio-generator'
import { extractTextFromPageImages } from '@/lib/intelligent-podcast/pdf-extractor'
import { DocumentContent, VoiceProfile } from '@/types/intelligent-podcast'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes

async function createAuthClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          try {
            cookieStore.set(name, value, options)
          } catch {
            // Called from Server Component
          }
        },
        remove(name: string, options: any) {
          try {
            cookieStore.set(name, '', options)
          } catch {
            // Called from Server Component
          }
        },
      },
    }
  )
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      console.error('[Podcast] OPENAI_API_KEY is not set')
      return NextResponse.json({
        error: 'Server configuration error',
        details: 'OpenAI API key is not configured'
      }, { status: 500 })
    }

    const supabase = await createAuthClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error('[Podcast] Auth error:', authError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      documents,
      targetDuration = 30,
      language = 'auto',
      style = 'conversational',
      voiceProvider = 'openai',
    } = body as {
      documents?: Array<{
        name: string
        page_images: Array<{ page_number: number; url: string }>
      }>
      targetDuration?: number
      language?: string
      style?: 'educational' | 'conversational' | 'technical' | 'storytelling'
      voiceProvider?: 'openai' | 'elevenlabs' | 'playht'
    }

    if (!documents || documents.length === 0) {
      return NextResponse.json({ error: 'At least one document with page_images is required' }, { status: 400 })
    }

    console.log(`[Podcast] Starting generation for ${documents.length} document(s)`)
    console.log(`[Podcast] User: ${user.id}, Style: ${style}, Duration: ${targetDuration}min`)

    // STEP 1: Transcribe each document from page images (GPT-4 Vision only – same as MCQ flow)
    const documentContents: DocumentContent[] = []

    for (const doc of documents) {
      if (!doc.page_images || doc.page_images.length === 0) {
        console.warn(`[Podcast] Skipping ${doc.name}: no page_images`)
        continue
      }

      try {
        console.log(`[Podcast] Transcribing ${doc.name} (${doc.page_images.length} pages)...`)
        const { content, pageCount } = await extractTextFromPageImages(doc.name, doc.page_images)

        if (!content || content.trim().length < 30) {
          throw new Error('Extracted content is too short or empty')
        }

        documentContents.push({
          id: crypto.randomUUID(),
          title: doc.name.replace(/\.pdf$/i, ''),
          content,
          pageCount,
          language: 'auto',
          extractedAt: new Date().toISOString(),
        })

        console.log(`[Podcast] ✅ ${doc.name}: ${content.length} chars, ${pageCount} pages`)
      } catch (error: any) {
        console.error(`[Podcast] Failed to transcribe ${doc.name}:`, error)
        return NextResponse.json({
          error: `Failed to transcribe ${doc.name}`,
          details: error.message || 'Unknown error'
        }, { status: 500 })
      }
    }

    if (documentContents.length === 0) {
      return NextResponse.json({
        error: 'No documents were successfully transcribed',
        details: 'Check that each document has page_images.'
      }, { status: 500 })
    }

    // STEP 2: Extract and analyze (knowledge graph)
    console.log('[Podcast] Step 2/4: Building knowledge graph...')
    const { knowledgeGraph, detectedLanguage } = await extractAndAnalyze(documentContents)

    const finalLanguage = language === 'auto' ? detectedLanguage : language

    // STEP 3: Voice profiles
    const voiceProfiles: VoiceProfile[] = [
      {
        id: 'host-voice',
        role: 'host',
        name: 'Sophie',
        provider: voiceProvider,
        voiceId: voiceProvider === 'openai' ? 'nova' : '21m00Tcm4TlvDq8ikWAM',
        description: 'Curious host who guides the conversation and asks clarifying questions',
      },
      {
        id: 'expert-voice',
        role: 'expert',
        name: 'Marcus',
        provider: voiceProvider,
        voiceId: voiceProvider === 'openai' ? 'onyx' : 'pNInz6obpgDQGcFmaJgB',
        description: 'Deep expert who provides detailed insights and technical knowledge',
      },
      {
        id: 'simplifier-voice',
        role: 'simplifier',
        name: 'Emma',
        provider: voiceProvider,
        voiceId: voiceProvider === 'openai' ? 'shimmer' : 'EXAVITQu4vr4xnSDxMaL',
        description: 'Friendly explainer who breaks down complex concepts into simple terms',
      },
    ]

    // STEP 4: Generate script
    console.log('[Podcast] Step 3/4: Generating script...')
    const { chapters, segments, predictedQuestions, title, description } = await generateIntelligentScript(
      documentContents,
      knowledgeGraph,
      {
        targetDuration,
        language: finalLanguage,
        style,
        voiceProfiles,
      }
    )

    // STEP 5: TTS – segments
    console.log('[Podcast] Step 4/4: Generating audio (TTS)...')
    const segmentsWithAudio = await generateMultiVoiceAudio(segments, voiceProfiles, finalLanguage, (current, total, step) => {
      console.log(`[Podcast] ${step}`)
    })

    // STEP 6: TTS – predicted Q&A
    console.log('[Podcast] Pre-generating Q&A audio...')
    const questionsWithAudio = await generatePredictedQuestionsAudio(
      predictedQuestions,
      finalLanguage,
      voiceProfiles[0],
      (current, total) => {
        console.log(`[Podcast] Q&A audio: ${current}/${total}`)
      }
    )

    const totalDuration = segmentsWithAudio.reduce((sum, seg) => sum + seg.duration, 0)

    // Save to DB
    const { data: podcast, error: insertError } = await supabase
      .from('intelligent_podcasts')
      .insert({
        user_id: user.id,
        title,
        description,
        duration: Math.round(totalDuration),
        language: finalLanguage,
        document_ids: documentContents.map(d => d.id),
        knowledge_graph: knowledgeGraph,
        chapters,
        segments: segmentsWithAudio,
        predicted_questions: questionsWithAudio,
        status: 'ready',
      })
      .select()
      .single()

    if (insertError) {
      console.error('[Podcast] Database error:', insertError)
      return NextResponse.json({ error: 'Failed to save podcast' }, { status: 500 })
    }

    console.log(`[Podcast] ✅ Done: ${podcast.id}`)

    return NextResponse.json({
      id: podcast.id,
      title,
      description,
      duration: Math.round(totalDuration),
      language: finalLanguage,
      chapters: chapters.length,
      segments: segmentsWithAudio.length,
      predictedQuestions: questionsWithAudio.length,
      status: 'ready',
      createdAt: podcast.created_at,
    })
  } catch (error: any) {
    console.error('[Podcast] Generation error:', error)
    return NextResponse.json({ error: 'Failed to generate podcast', details: error.message }, { status: 500 })
  }
}
