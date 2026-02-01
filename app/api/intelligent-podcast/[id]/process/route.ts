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

    const body = await request.json().catch(() => ({}))
    const documents = body?.documents
    const config = body?.config

    // Load current podcast state (for resumability)
    const { data: existing, error: fetchError } = await supabase
      .from('intelligent_podcasts')
      .select('id,user_id,title,description,status,generation_progress,language,knowledge_graph,chapters,segments,predicted_questions')
      .eq('id', podcastId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Podcast not found' }, { status: 404 })
    }

    const existingSegments: PodcastSegment[] = Array.isArray(existing.segments) ? existing.segments : []
    const hasScript = existingSegments.length > 0 && existingSegments.some((s: any) => typeof s?.text === 'string' && s.text.trim().length > 0)

    // If there is already a script, we can continue audio generation without needing docs again.
    if (!hasScript) {
      if (!documents || !config) {
        return NextResponse.json(
          { error: 'Missing required body', details: 'documents + config are required for initial processing' },
          { status: 400 }
        )
      }
    }

    const finalLanguage =
      (hasScript && typeof existing.language === 'string' && existing.language.length > 0 && existing.language !== 'auto')
        ? existing.language
        : (config?.language && config.language !== 'auto' ? config.language : 'en')

    const voiceProvider: 'openai' | 'elevenlabs' | 'playht' = config?.voiceProvider || 'openai'
    const voiceProfiles = voiceProfilesForProvider(voiceProvider)

    // STEP A: If script not present, do OCR + analysis + script, and save immediately (so audio can resume later).
    if (!hasScript) {
      // STEP 1: Transcription Vision (10-35%)
      await updateProgress(10, `Transcription: 0/${documents.length} documents`)
      const extractedDocuments: DocumentContent[] = []

      for (let i = 0; i < documents.length; i++) {
        const doc = documents[i]
        await updateProgress(10 + Math.round((i / documents.length) * 25), `Transcription: ${i + 1}/${documents.length}`)

        const { content, pageCount } = await extractTextFromPageImages(doc.name, doc.page_images)
        console.log(`[Podcast ${podcastId}] OCR doc ${i + 1}/${documents.length}: ${doc.name} (${pageCount} pages, ${content.length} chars)`)
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
      console.log(
        `[Podcast ${podcastId}] Knowledge graph: ${knowledgeGraph.concepts?.length || 0} concepts, ${knowledgeGraph.relationships?.length || 0} relationships`
      )

      const computedLanguage =
        config.language && config.language !== 'auto' ? config.language : (detectedLanguage || 'en')

      // STEP 3: Script generation (50-65%)
      await updateProgress(50, `Generating detailed ${config.targetDuration}-minute script...`)
      const script = await generateIntelligentScript(extractedDocuments, knowledgeGraph, {
        targetDuration: config.targetDuration,
        language: computedLanguage,
        style: config.style,
        voiceProfiles,
      })

      const totalWords = script.segments.reduce((sum, s) => sum + String(s.text || '').trim().split(/\s+/).filter(Boolean).length, 0)
      const estMinutes = totalWords / 150
      await updateProgress(
        65,
        `Script ready: ${script.segments.length} segments (~${estMinutes.toFixed(1)} min est, ${totalWords} words)`
      )

      // Persist script now (critical for resumability)
      await supabase
        .from('intelligent_podcasts')
        .update({
          title: script.title || existing.title,
          description: existing.description,
          language: computedLanguage,
          knowledge_graph: knowledgeGraph,
          chapters: script.chapters,
          segments: script.segments,
          predicted_questions: script.predictedQuestions || [],
          status: 'generating',
          generation_progress: 65,
        })
        .eq('id', podcastId)
    }

    // Reload latest script/segments from DB (source of truth)
    const { data: current, error: currentError } = await supabase
      .from('intelligent_podcasts')
      .select('id,title,description,language,chapters,segments,status')
      .eq('id', podcastId)
      .eq('user_id', user.id)
      .single()

    if (currentError || !current) throw new Error('Failed to load podcast after script generation')

    const chapters: PodcastChapter[] = Array.isArray(current.chapters) ? current.chapters : []
    const segments: PodcastSegment[] = Array.isArray(current.segments) ? current.segments : []

    const remaining = segments.filter((s: any) => !(typeof s?.audioUrl === 'string' && s.audioUrl.length > 0))
    const completed = segments.length - remaining.length
    const pctAudio = segments.length > 0 ? completed / segments.length : 0

    // If audio is complete, finalize timings and mark ready.
    if (remaining.length === 0 && segments.length > 0) {
      const timings = recomputeTimings(segments)
      const updatedChapters = recomputeChapterTimes(chapters, timings.segments)
      await updateProgress(95, 'Finalizing...')
      await supabase
        .from('intelligent_podcasts')
        .update({
          duration: timings.totalDuration,
          chapters: updatedChapters,
          segments: timings.segments,
          status: 'ready',
          generation_progress: 100,
        })
        .eq('id', podcastId)
      console.log(`[Podcast ${podcastId}] ✅ Complete!`)
      return NextResponse.json({ success: true })
    }

    // STEP B: Generate audio in small batches to stay within serverless limits.
    const BATCH_SIZE = 6
    const batch = remaining.slice(0, BATCH_SIZE)

    await updateProgress(
      65 + Math.round(pctAudio * 27),
      `Audio generation: ${completed}/${segments.length} segments completed`
    )

    const batchWithAudio = await generateMultiVoiceAudio(
      batch,
      voiceProfiles,
      finalLanguage,
      (currentIdx, total, step) => {
        const withinBatch = total > 0 ? currentIdx / total : 0
        const pct = 65 + Math.round((pctAudio + withinBatch * (BATCH_SIZE / Math.max(1, segments.length))) * 27)
        void updateProgress(Math.min(92, pct), step)
      }
    )

    await updateProgress(92, 'Uploading audio batch to storage...')

    const byId: Record<string, PodcastSegment> = {}
    for (const s of segments) byId[s.id] = s

    // Upload only the newly generated audio segments
    for (let i = 0; i < batchWithAudio.length; i++) {
      const seg = batchWithAudio[i]
      if (!seg.audioUrl) continue

      const { bytes, contentType } = await audioBytesFromUrl(seg.audioUrl)
      const isWav = contentType.includes('wav')
      const ext = isWav ? 'wav' : 'mp3'

      const absoluteIndex = segments.findIndex((s) => s.id === seg.id)
      const ordinal = absoluteIndex >= 0 ? absoluteIndex + 1 : completed + i + 1

      const path = `podcasts/${podcastId}/segments/${String(ordinal).padStart(3, '0')}-${seg.speaker}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('podcast-audio')
        .upload(path, bytes, {
          contentType: isWav ? 'audio/wav' : 'audio/mpeg',
          upsert: true,
        })

      if (uploadError) throw new Error(`Audio upload failed: ${uploadError.message}`)

      const { data: publicData } = supabase.storage.from('podcast-audio').getPublicUrl(path)
      byId[seg.id] = { ...seg, audioUrl: publicData.publicUrl }
    }

    const mergedSegments = segments.map((s) => byId[s.id] || s)
    const timings = recomputeTimings(mergedSegments)
    const updatedChapters = recomputeChapterTimes(chapters, timings.segments)

    const newRemaining = timings.segments.filter((s: any) => !(typeof s?.audioUrl === 'string' && s.audioUrl.length > 0))
    const newCompleted = timings.segments.length - newRemaining.length
    const newPctAudio = timings.segments.length > 0 ? newCompleted / timings.segments.length : 0

    await supabase
      .from('intelligent_podcasts')
      .update({
        duration: timings.totalDuration,
        chapters: updatedChapters,
        segments: timings.segments,
        status: 'generating',
        generation_progress: Math.min(92, 65 + Math.round(newPctAudio * 27)),
        description: `Audio generation: ${newCompleted}/${timings.segments.length} segments completed`,
      })
      .eq('id', podcastId)

    return NextResponse.json({
      success: true,
      status: 'generating',
      completedSegments: newCompleted,
      totalSegments: timings.segments.length,
    })

  } catch (error: any) {
    console.error(`[Podcast ${podcastId}] Error:`, error)
    await supabase
      .from('intelligent_podcasts')
      .update({ status: 'error', description: `Erreur: ${error.message}` })
      .eq('id', podcastId)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
