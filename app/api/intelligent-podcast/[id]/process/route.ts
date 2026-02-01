import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { extractTextFromPageImages } from '@/lib/intelligent-podcast/pdf-extractor'
import { extractAndAnalyze } from '@/lib/intelligent-podcast/extractor'
import { generateIntelligentScript } from '@/lib/intelligent-podcast/script-generator'
import { generateMultiVoiceAudio } from '@/lib/intelligent-podcast/audio-generator'
import { DocumentContent, VoiceProfile, PodcastChapter, PodcastSegment } from '@/types/intelligent-podcast'

export const runtime = 'nodejs'
export const maxDuration = 900 // long-running generation

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

  const voiceProfilesForProvider = (provider: 'openai' | 'elevenlabs' | 'playht'): VoiceProfile[] => {
    if (provider === 'elevenlabs') {
      return [
        {
          id: 'host-voice',
          role: 'host',
          name: 'Sophie',
          provider: 'elevenlabs',
          voiceId: '21m00Tcm4TlvDq8ikWAM',
          description: 'Curious host who guides the conversation and asks sharp questions',
        },
        {
          id: 'expert-voice',
          role: 'expert',
          name: 'Marcus',
          provider: 'elevenlabs',
          voiceId: 'pNInz6obpgDQGcFmaJgB',
          description: 'Deep expert who explains mechanisms, details, and nuance',
        },
        {
          id: 'simplifier-voice',
          role: 'simplifier',
          name: 'Emma',
          provider: 'elevenlabs',
          voiceId: 'EXAVITQu4vr4xnSDxMaL',
          description: 'Simplifier who uses analogies and step-by-step explanations',
        },
      ]
    }

    // NOTE: PlayHT voice IDs are project-specific; fallback to OpenAI voices for now.
    if (provider === 'playht') {
      provider = 'openai'
    }

    return [
      {
        id: 'host-voice',
        role: 'host',
        name: 'Sophie',
        provider: 'openai',
        voiceId: 'nova',
        description: 'Curious host who guides the conversation and asks sharp questions',
      },
      {
        id: 'expert-voice',
        role: 'expert',
        name: 'Marcus',
        provider: 'openai',
        voiceId: 'onyx',
        description: 'Deep expert who explains mechanisms, details, and nuance',
      },
      {
        id: 'simplifier-voice',
        role: 'simplifier',
        name: 'Emma',
        provider: 'openai',
        voiceId: 'shimmer',
        description: 'Simplifier who uses analogies and step-by-step explanations',
      },
    ]
  }

  const audioBytesFromUrl = async (audioUrl: string): Promise<{ bytes: Buffer; contentType: string }> => {
    if (audioUrl.startsWith('data:')) {
      const match = audioUrl.match(/^data:([^;]+);base64,(.*)$/)
      if (!match) {
        throw new Error('Invalid data URL audio')
      }
      const contentType = match[1] || 'audio/mpeg'
      const base64 = match[2] || ''
      return { bytes: Buffer.from(base64, 'base64'), contentType }
    }

    const res = await fetch(audioUrl)
    if (!res.ok) {
      throw new Error(`Failed to fetch audio (${res.status})`)
    }
    const contentType = res.headers.get('content-type') || 'audio/mpeg'
    const arr = await res.arrayBuffer()
    return { bytes: Buffer.from(arr), contentType }
  }

  const recomputeTimings = (segments: PodcastSegment[]): { segments: PodcastSegment[]; totalDuration: number } => {
    let t = 0
    const updated = segments.map((s) => {
      const next = { ...s, timestamp: t }
      t += Math.max(0, Number(s.duration) || 0)
      return next
    })
    return { segments: updated, totalDuration: Math.round(t) }
  }

  const recomputeChapterTimes = (chapters: PodcastChapter[], segments: PodcastSegment[]): PodcastChapter[] => {
    const byChapter: Record<string, PodcastSegment[]> = {}
    for (const seg of segments) {
      if (!byChapter[seg.chapterId]) byChapter[seg.chapterId] = []
      byChapter[seg.chapterId].push(seg)
    }

    return chapters.map((ch) => {
      const segs = byChapter[ch.id] || []
      if (segs.length === 0) return ch
      const start = Math.min(...segs.map((s) => s.timestamp))
      const end = Math.max(...segs.map((s) => s.timestamp + s.duration))
      return { ...ch, startTime: start, endTime: end }
    })
  }

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { documents, config } = body

    // STEP 1: Transcription Vision (10-35%)
    await updateProgress(10, `Transcription: 0/${documents.length} documents`)
    const extractedDocuments: DocumentContent[] = []

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i]
      await updateProgress(10 + Math.round((i / documents.length) * 25), `Transcription: ${i + 1}/${documents.length}`)

      const { content, pageCount } = await extractTextFromPageImages(doc.name, doc.page_images)
      extractedDocuments.push({
        id: crypto.randomUUID(),
        title: doc.name,
        content,
        pageCount,
        language: 'auto',
        extractedAt: new Date().toISOString(),
      })
    }

    // STEP 2: Knowledge graph + language detection (35-50%)
    await updateProgress(35, 'Analyzing content & building knowledge graph...')
    const { knowledgeGraph, detectedLanguage } = await extractAndAnalyze(extractedDocuments)

    const finalLanguage =
      config.language && config.language !== 'auto' ? config.language : (detectedLanguage || 'en')

    const voiceProvider: 'openai' | 'elevenlabs' | 'playht' = config.voiceProvider || 'openai'
    const voiceProfiles = voiceProfilesForProvider(voiceProvider)

    // STEP 3: Script generation (50-65%)
    await updateProgress(50, `Generating detailed ${config.targetDuration}-minute script...`)
    const script = await generateIntelligentScript(extractedDocuments, knowledgeGraph, {
      targetDuration: config.targetDuration,
      language: finalLanguage,
      style: config.style,
      voiceProfiles,
    })

    await updateProgress(65, `Script ready: ${script.segments.length} segments`)

    // STEP 4: Audio generation (65-92%)
    const segmentsWithAudio = await generateMultiVoiceAudio(
      script.segments,
      voiceProfiles,
      finalLanguage,
      (current, total, step) => {
        const pct = 65 + Math.round((current / Math.max(1, total)) * 27)
        void updateProgress(pct, step)
      }
    )

    await updateProgress(92, 'Uploading audio to storage...')

    // Upload audio to Supabase Storage so it persists & can be downloaded
    const uploadedSegments: PodcastSegment[] = []
    for (let i = 0; i < segmentsWithAudio.length; i++) {
      const seg = segmentsWithAudio[i]
      if (!seg.audioUrl) {
        uploadedSegments.push(seg)
        continue
      }

      const { bytes, contentType } = await audioBytesFromUrl(seg.audioUrl)
      const isWav = contentType.includes('wav')
      const ext = isWav ? 'wav' : 'mp3'

      const path = `podcasts/${podcastId}/segments/${String(i + 1).padStart(3, '0')}-${seg.speaker}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('podcast-audio')
        .upload(path, bytes, {
          contentType: isWav ? 'audio/wav' : 'audio/mpeg',
          upsert: true,
        })

      if (uploadError) {
        throw new Error(`Audio upload failed: ${uploadError.message}`)
      }

      const { data: publicData } = supabase.storage.from('podcast-audio').getPublicUrl(path)
      uploadedSegments.push({
        ...seg,
        audioUrl: publicData.publicUrl,
      })
    }

    const timings = recomputeTimings(uploadedSegments)
    const updatedChapters = recomputeChapterTimes(script.chapters, timings.segments)

    // STEP 5: Save to DB (95-100%)
    await updateProgress(95, 'Finalizing...')
    const placeholderTitle = documents.map((d: any) => d.name.replace(/\.pdf$/i, '')).join(', ')

    await supabase
      .from('intelligent_podcasts')
      .update({
        title: script.title || placeholderTitle,
        description: script.description || 'Podcast generated',
        duration: timings.totalDuration,
        language: finalLanguage,
        knowledge_graph: knowledgeGraph,
        chapters: updatedChapters,
        segments: timings.segments,
        predicted_questions: script.predictedQuestions || [],
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
