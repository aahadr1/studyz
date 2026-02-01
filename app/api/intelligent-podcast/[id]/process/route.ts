import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { extractTextFromPageImages } from '@/lib/intelligent-podcast/pdf-extractor'
import { getOpenAI } from '@/lib/intelligent-podcast/openai-client'
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
        get(name: string) { return cookieStore.get(name)?.value },
        set(name: string, value: string, options: any) { try { cookieStore.set(name, value, options) } catch {} },
        remove(name: string, options: any) { try { cookieStore.set(name, '', options) } catch {} },
      },
    }
  )
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: podcastId } = await params
  const supabase = await createAuthClient()
  
  const updateProgress = async (progress: number, message: string) => {
    await supabase
      .from('intelligent_podcasts')
      .update({ generation_progress: progress, description: message, status: 'generating' })
      .eq('id', podcastId)
    console.log(`[Podcast ${podcastId}] ${progress}% - ${message}`)
  }

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { documents, config } = body

    // STEP 1: Transcription Vision (10-40%)
    await updateProgress(10, `Transcription: 0/${documents.length} documents`)
    const allContent: string[] = []

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i]
      await updateProgress(10 + Math.round((i / documents.length) * 30), `Transcription: ${i + 1}/${documents.length}`)
      
      const { content } = await extractTextFromPageImages(doc.name, doc.page_images)
      allContent.push(`\n\n=== ${doc.name} ===\n\n${content}`)
    }

    const fullText = allContent.join('\n\n')
    console.log(`[Podcast ${podcastId}] Total content: ${fullText.length} chars`)

    // STEP 2: Génération directe du script conversationnel (40-60%)
    await updateProgress(40, 'Génération du script conversationnel...')
    const openai = getOpenAI()

    const scriptPrompt = config.language === 'fr' 
      ? `Tu es un expert en création de podcasts éducatifs conversationnels.

Crée un script de podcast de ${config.targetDuration} minutes basé sur ce contenu.

STYLE: ${config.style}

RÈGLES:
1. 3 voix qui alternent naturellement:
   - HOST (Sophie): Pose des questions, guide la conversation
   - EXPERT (Marcus): Explique en profondeur
   - SIMPLIFIER (Emma): Simplifie les concepts complexes
   
2. Crée 15-25 segments courts (2-4 phrases chacun)
3. Conversation naturelle et engageante
4. Progression logique des concepts

Retourne un objet json:
{
  "title": "Titre accrocheur du podcast",
  "description": "Description en 2 phrases",
  "segments": [
    {
      "speaker": "host",
      "text": "Bienvenue! Aujourd'hui on parle de...",
      "order": 0
    },
    {
      "speaker": "expert", 
      "text": "Merci Sophie. Ce sujet est fascinant car...",
      "order": 1
    }
  ]
}

CONTENU À TRAITER:
${fullText.slice(0, 12000)}`
      : `You are an expert at creating educational conversational podcasts.

Create a ${config.targetDuration}-minute podcast script from this content.

STYLE: ${config.style}

RULES:
1. 3 voices alternating naturally:
   - HOST (Sophie): Asks questions, guides
   - EXPERT (Marcus): Explains in depth
   - SIMPLIFIER (Emma): Simplifies complex concepts
   
2. Create 15-25 short segments (2-4 sentences each)
3. Natural, engaging conversation
4. Logical concept progression

Return a json object:
{
  "title": "Catchy podcast title",
  "description": "Description in 2 sentences",
  "segments": [
    {
      "speaker": "host",
      "text": "Welcome! Today we're discussing...",
      "order": 0
    },
    {
      "speaker": "expert",
      "text": "Thanks Sophie. This topic is fascinating because...",
      "order": 1
    }
  ]
}

CONTENT TO PROCESS:
${fullText.slice(0, 12000)}`

    const scriptResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: scriptPrompt },
        { role: 'user', content: 'Generate the podcast script based on the content above.' }
      ],
      response_format: { type: 'json_object' },
      max_tokens: 8192,
      temperature: 0.8,
    })

    const scriptData = JSON.parse(scriptResponse.choices[0]?.message?.content || '{}')
    const { title, description, segments: rawSegments } = scriptData

    await updateProgress(60, `Script généré: ${rawSegments?.length || 0} segments`)

    // STEP 3: TTS en parallèle par lots (60-95%)
    const segments = rawSegments || []
    const voiceMap: Record<string, string> = {
      host: config.voiceProvider === 'openai' ? 'nova' : '21m00Tcm4TlvDq8ikWAM',
      expert: config.voiceProvider === 'openai' ? 'onyx' : 'pNInz6obpgDQGcFmaJgB',
      simplifier: config.voiceProvider === 'openai' ? 'shimmer' : 'EXAVITQu4vr4xnSDxMaL',
    }

    const segmentsWithAudio: Array<{
      id: string
      speaker: string
      text: string
      audioUrl: string
      duration: number
      timestamp: number
    }> = []
    const batchSize = 3

    for (let i = 0; i < segments.length; i += batchSize) {
      const batch = segments.slice(i, i + batchSize)
      await updateProgress(60 + Math.round((i / segments.length) * 35), `Audio: ${i}/${segments.length}`)

      for (const seg of batch) {
        const voice = voiceMap[seg.speaker] || 'nova'
        const response = await openai.audio.speech.create({
          model: 'tts-1',
          voice: voice as any,
          input: seg.text,
          speed: 1.0,
        })

        const audioBuffer = await response.arrayBuffer()
        const audioBase64 = Buffer.from(audioBuffer).toString('base64')
        const audioUrl = `data:audio/mpeg;base64,${audioBase64}`

        const wordCount = seg.text.split(/\s+/).length
        const duration = (wordCount / 150) * 60

        segmentsWithAudio.push({
          id: `seg-${i + batch.indexOf(seg)}`,
          speaker: seg.speaker,
          text: seg.text,
          audioUrl,
          duration,
          timestamp: segmentsWithAudio.reduce((sum, s) => sum + s.duration, 0),
        })
      }
    }

    const totalDuration = segmentsWithAudio.reduce((sum, s) => sum + s.duration, 0)

    // STEP 4: Sauvegarde (95-100%)
    await updateProgress(95, 'Finalisation...')
    const placeholderTitle = documents.map((d: any) => d.name.replace(/\.pdf$/i, '')).join(', ')
    
    await supabase
      .from('intelligent_podcasts')
      .update({
        title: title || placeholderTitle,
        description: description || 'Podcast généré',
        duration: Math.round(totalDuration),
        language: config.language === 'auto' ? 'en' : config.language,
        knowledge_graph: { concepts: [], relationships: [], embeddings: {} },
        chapters: [],
        segments: segmentsWithAudio,
        predicted_questions: [],
        status: 'ready',
        generation_progress: 100,
      })
      .eq('id', podcastId)

    console.log(`[Podcast ${podcastId}] ✅ Complete!`)
    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error(`[Podcast ${podcastId}] Error:`, error)
    await supabase
      .from('intelligent_podcasts')
      .update({ status: 'error', description: `Erreur: ${error.message}` })
      .eq('id', podcastId)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
