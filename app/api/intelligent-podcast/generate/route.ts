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

function createSimpleClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get() { return undefined },
        set() {},
        remove() {},
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

    // Create podcast record immediately with "generating" status
    const placeholderTitle = documents.map(d => d.name.replace(/\.pdf$/i, '')).join(', ')
    const { data: podcast, error: insertError } = await supabase
      .from('intelligent_podcasts')
      .insert({
        user_id: user.id,
        title: placeholderTitle,
        description: 'Initializing...',
        duration: 0,
        language: language === 'auto' ? 'en' : language,
        document_ids: documents.map(() => crypto.randomUUID()),
        knowledge_graph: { concepts: [], relationships: [], embeddings: {} },
        chapters: [],
        segments: [],
        predicted_questions: [],
        status: 'generating',
        generation_progress: 0,
      })
      .select()
      .single()

    if (insertError || !podcast) {
      console.error('[Podcast] Failed to create podcast record:', insertError)
      return NextResponse.json({ error: 'Failed to create podcast' }, { status: 500 })
    }

    console.log(`[Podcast] Created podcast ${podcast.id}, starting background generation`)

    // Start background generation (don't await - fire and forget)
    generatePodcastInBackground(podcast.id, documents, {
      targetDuration,
      language,
      style,
      voiceProvider,
    }).catch(err => {
      console.error(`[Podcast] Background generation failed for ${podcast.id}:`, err)
    })

    // Return immediately so client doesn't timeout
    return NextResponse.json({
      id: podcast.id,
      status: 'generating',
      message: 'Podcast generation started in background',
    })
  } catch (error: any) {
    console.error('[Podcast] Setup error:', error)
    return NextResponse.json({ error: 'Failed to start podcast generation', details: error.message }, { status: 500 })
  }
}

async function generatePodcastInBackground(
  podcastId: string,
  documents: Array<{ name: string; page_images: Array<{ page_number: number; url: string }> }>,
  config: {
    targetDuration: number
    language: string
    style: 'educational' | 'conversational' | 'technical' | 'storytelling'
    voiceProvider: 'openai' | 'elevenlabs' | 'playht'
  }
) {
  const supabase = createSimpleClient()

  const updateProgress = async (progress: number, message: string) => {
    await supabase
      .from('intelligent_podcasts')
      .update({ 
        generation_progress: progress,
        description: message 
      })
      .eq('id', podcastId)
    console.log(`[Podcast ${podcastId}] ${progress}% - ${message}`)
  }

  try {
    console.log(`[Podcast ${podcastId}] Background generation started`)

    // STEP 1: Transcribe documents (5-30%)
    await updateProgress(5, 'Transcribing documents...')
    const documentContents: DocumentContent[] = []

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i]
      if (!doc.page_images || doc.page_images.length === 0) {
        continue
      }

      const { content, pageCount } = await extractTextFromPageImages(doc.name, doc.page_images)

      documentContents.push({
        id: crypto.randomUUID(),
        title: doc.name.replace(/\.pdf$/i, ''),
        content,
        pageCount,
        language: 'auto',
        extractedAt: new Date().toISOString(),
      })

      await updateProgress(5 + Math.round((i + 1) / documents.length * 25), `Transcribed ${i + 1}/${documents.length} documents`)
    }

    if (documentContents.length === 0) {
      throw new Error('No documents were successfully transcribed')
    }

    // STEP 2: Build knowledge graph (30-40%)
    await updateProgress(30, 'Building knowledge graph...')
    const { knowledgeGraph, detectedLanguage } = await extractAndAnalyze(documentContents)
    const finalLanguage = config.language === 'auto' ? detectedLanguage : config.language

    // STEP 3: Voice profiles
    const voiceProfiles: VoiceProfile[] = [
      {
        id: 'host-voice',
        role: 'host',
        name: 'Sophie',
        provider: config.voiceProvider,
        voiceId: config.voiceProvider === 'openai' ? 'nova' : '21m00Tcm4TlvDq8ikWAM',
        description: 'Curious host who guides the conversation and asks clarifying questions',
      },
      {
        id: 'expert-voice',
        role: 'expert',
        name: 'Marcus',
        provider: config.voiceProvider,
        voiceId: config.voiceProvider === 'openai' ? 'onyx' : 'pNInz6obpgDQGcFmaJgB',
        description: 'Deep expert who provides detailed insights and technical knowledge',
      },
      {
        id: 'simplifier-voice',
        role: 'simplifier',
        name: 'Emma',
        provider: config.voiceProvider,
        voiceId: config.voiceProvider === 'openai' ? 'shimmer' : 'EXAVITQu4vr4xnSDxMaL',
        description: 'Friendly explainer who breaks down complex concepts into simple terms',
      },
    ]

    // STEP 4: Generate script (40-50%)
    await updateProgress(40, 'Generating intelligent script...')
    const { chapters, segments, predictedQuestions, title, description } = await generateIntelligentScript(
      documentContents,
      knowledgeGraph,
      {
        targetDuration: config.targetDuration,
        language: finalLanguage,
        style: config.style,
        voiceProfiles,
      }
    )

    await updateProgress(50, `Script ready: ${segments.length} segments`)

    // STEP 5: Generate audio in SMALL BATCHES (50-90%)
    console.log(`[Podcast ${podcastId}] Generating audio for ${segments.length} segments in batches of 5...`)
    const batchSize = 5
    const segmentsWithAudio: typeof segments = []

    for (let i = 0; i < segments.length; i += batchSize) {
      const batch = segments.slice(i, i + batchSize)
      const batchNum = Math.floor(i / batchSize) + 1
      const totalBatches = Math.ceil(segments.length / batchSize)

      await updateProgress(
        50 + Math.round((i / segments.length) * 40),
        `Audio: batch ${batchNum}/${totalBatches} (${i}/${segments.length} segments)`
      )

      const batchWithAudio = await generateMultiVoiceAudio(
        batch,
        voiceProfiles,
        finalLanguage,
        () => {}
      )

      segmentsWithAudio.push(...batchWithAudio)
    }

    // STEP 6: Generate Q&A audio (90-95%)
    await updateProgress(90, 'Generating Q&A audio...')
    const questionsWithAudio = await generatePredictedQuestionsAudio(
      predictedQuestions,
      finalLanguage,
      voiceProfiles[0],
      () => {}
    )

    const totalDuration = segmentsWithAudio.reduce((sum, seg) => sum + seg.duration, 0)

    // STEP 7: Save final podcast (95-100%)
    await updateProgress(95, 'Finalizing podcast...')
    const { error: updateError } = await supabase
      .from('intelligent_podcasts')
      .update({
        title,
        description,
        duration: Math.round(totalDuration),
        language: finalLanguage,
        knowledge_graph: knowledgeGraph,
        chapters,
        segments: segmentsWithAudio,
        predicted_questions: questionsWithAudio,
        status: 'ready',
        generation_progress: 100,
      })
      .eq('id', podcastId)

    if (updateError) {
      console.error(`[Podcast ${podcastId}] Failed to update:`, updateError)
      throw updateError
    }

    console.log(`[Podcast ${podcastId}] ✅ Generation completed successfully!`)
  } catch (error: any) {
    console.error(`[Podcast ${podcastId}] Background error:`, error)
    await supabase
      .from('intelligent_podcasts')
      .update({
        status: 'error',
        description: `Error: ${error.message}`,
      })
      .eq('id', podcastId)
  }
}
