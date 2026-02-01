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
          } catch {}
        },
        remove(name: string, options: any) {
          try {
            cookieStore.set(name, '', options)
          } catch {}
        },
      },
    }
  )
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: podcastId } = await params
    const supabase = await createAuthClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the podcast record
    const { data: podcast, error: fetchError } = await supabase
      .from('intelligent_podcasts')
      .select('*')
      .eq('id', podcastId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !podcast) {
      return NextResponse.json({ error: 'Podcast not found' }, { status: 404 })
    }

    if (podcast.status !== 'pending') {
      return NextResponse.json({ error: 'Podcast already processed or processing' }, { status: 400 })
    }

    const body = await request.json()
    const { documents, config } = body

    const updateProgress = async (progress: number, message: string) => {
      await supabase
        .from('intelligent_podcasts')
        .update({ 
          generation_progress: progress,
          description: message,
          status: 'generating'
        })
        .eq('id', podcastId)
      console.log(`[Podcast ${podcastId}] ${progress}% - ${message}`)
    }

    try {
      // STEP 1: Transcribe (5-30%)
      await updateProgress(5, 'Transcribing documents...')
      const documentContents: DocumentContent[] = []

      for (let i = 0; i < documents.length; i++) {
        const doc = documents[i]
        const { content, pageCount } = await extractTextFromPageImages(doc.name, doc.page_images)

        documentContents.push({
          id: crypto.randomUUID(),
          title: doc.name.replace(/\.pdf$/i, ''),
          content,
          pageCount,
          language: 'auto',
          extractedAt: new Date().toISOString(),
        })

        await updateProgress(5 + Math.round((i + 1) / documents.length * 25), `Transcribed ${i + 1}/${documents.length}`)
      }

      // STEP 2: Knowledge graph (30-40%)
      await updateProgress(30, 'Building knowledge graph...')
      const { knowledgeGraph, detectedLanguage } = await extractAndAnalyze(documentContents)
      const finalLanguage = config.language === 'auto' ? detectedLanguage : config.language

      // STEP 3: Voice profiles
      const voiceProfiles: VoiceProfile[] = [
        { id: 'host-voice', role: 'host', name: 'Sophie', provider: config.voiceProvider, voiceId: config.voiceProvider === 'openai' ? 'nova' : '21m00Tcm4TlvDq8ikWAM', description: 'Host' },
        { id: 'expert-voice', role: 'expert', name: 'Marcus', provider: config.voiceProvider, voiceId: config.voiceProvider === 'openai' ? 'onyx' : 'pNInz6obpgDQGcFmaJgB', description: 'Expert' },
        { id: 'simplifier-voice', role: 'simplifier', name: 'Emma', provider: config.voiceProvider, voiceId: config.voiceProvider === 'openai' ? 'shimmer' : 'EXAVITQu4vr4xnSDxMaL', description: 'Simplifier' },
      ]

      // STEP 4: Script (40-50%)
      await updateProgress(40, 'Generating script...')
      const { chapters, segments, predictedQuestions, title, description } = await generateIntelligentScript(
        documentContents,
        knowledgeGraph,
        { targetDuration: config.targetDuration, language: finalLanguage, style: config.style, voiceProfiles }
      )

      await updateProgress(50, `Script: ${segments.length} segments`)

      // STEP 5: TTS in batches (50-90%)
      const batchSize = 5
      const segmentsWithAudio: typeof segments = []

      for (let i = 0; i < segments.length; i += batchSize) {
        const batch = segments.slice(i, i + batchSize)
        await updateProgress(50 + Math.round((i / segments.length) * 40), `Audio: ${i}/${segments.length}`)
        const batchWithAudio = await generateMultiVoiceAudio(batch, voiceProfiles, finalLanguage, () => {})
        segmentsWithAudio.push(...batchWithAudio)
      }

      // STEP 6: Q&A (90-95%)
      await updateProgress(90, 'Q&A audio...')
      const questionsWithAudio = await generatePredictedQuestionsAudio(predictedQuestions, finalLanguage, voiceProfiles[0], () => {})

      const totalDuration = segmentsWithAudio.reduce((sum, seg) => sum + seg.duration, 0)

      // STEP 7: Save (95-100%)
      await updateProgress(95, 'Finalizing...')
      await supabase
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

      return NextResponse.json({ success: true })
    } catch (error: any) {
      await supabase
        .from('intelligent_podcasts')
        .update({ status: 'error', description: `Error: ${error.message}` })
        .eq('id', podcastId)
      throw error
    }
  } catch (error: any) {
    console.error('[Podcast Process] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
