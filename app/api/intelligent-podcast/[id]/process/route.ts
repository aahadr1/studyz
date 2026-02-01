import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { extractAndAnalyze } from '@/lib/intelligent-podcast/extractor'
import { generateIntelligentScript } from '@/lib/intelligent-podcast/script-generator'
import { generateMultiVoiceAudio } from '@/lib/intelligent-podcast/audio-generator'
import { getOpenAI } from '@/lib/intelligent-podcast/openai-client'
import { DocumentContent, VoiceProfile, PodcastChapter, PodcastSegment } from '@/types/intelligent-podcast'

export const runtime = 'nodejs'
// Vercel Pro Serverless Functions require maxDuration between 1 and 800.
export const maxDuration = 800 // long-running generation (resumable)

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

  const TRANSCRIPTION_SYSTEM_PROMPT = `You are an expert at transcribing educational documents from images.

TASK:
- Extract ALL readable text from the page image (including headers, footers, tables, captions, labels, and text inside diagrams).
- Preserve structure: headings, paragraphs, lists, and table structure (use plain-text tables when needed).
- For mathematical formulas, write them in LaTeX.
- Do NOT summarize, do NOT explain, do NOT add commentary.

OUTPUT:
- Plain text only.`

  const transcribePageImageWithOpenAI = async (params: {
    documentName: string
    pageNumber: number
    imageUrl: string
  }): Promise<string> => {
    const openai = getOpenAI()

    const resp = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: TRANSCRIPTION_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Document: ${params.documentName}\nPage: ${params.pageNumber}\n\nTranscribe this page image completely.`,
            },
            { type: 'image_url', image_url: { url: params.imageUrl, detail: 'high' } },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 6000,
    })

    return String(resp.choices[0]?.message?.content || '').trim()
  }

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const documents = body?.documents as Array<{ name: string; storage_path: string }> | undefined
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
      if (!config) {
        return NextResponse.json(
          { error: 'Missing required body', details: 'config is required for initial processing' },
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
      // STEP 1: PDF -> Images -> GPT Vision transcription (10-35%) (resumable per page)
      await updateProgress(10, 'Transcription: preparing documents...')

      // Load (or create) source documents for this podcast
      let { data: docRows, error: docRowsError } = await supabase
        .from('intelligent_podcast_documents')
        .select('id,name,storage_path,page_count,page_images')
        .eq('podcast_id', podcastId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })

      if (docRowsError) {
        const looksLikeMissingMigration =
          (docRowsError as any).code === '42P01' ||
          /relation\s+"intelligent_podcast_documents"\s+does not exist/i.test(String(docRowsError.message || ''))
        const looksLikeMissingColumn =
          (docRowsError as any).code === '42703' ||
          /column\s+"page_images"\s+does not exist/i.test(String(docRowsError.message || ''))
        throw new Error(
          looksLikeMissingMigration
            ? 'Missing table intelligent_podcast_documents. Apply migration 020_intelligent_podcast_documents_and_transcriptions.sql as postgres/supabase_admin.'
            : looksLikeMissingColumn
              ? 'Missing column intelligent_podcast_documents.page_images. Apply migration 021_intelligent_podcast_document_page_images.sql.'
            : `Failed to load podcast documents: ${docRowsError.message}`
        )
      }

      // Best-effort: if none exist yet but request provided documents, create them now.
      if ((!docRows || docRows.length === 0) && documents && documents.length > 0) {
        const { error: insertDocsError } = await supabase
          .from('intelligent_podcast_documents')
          .insert(
            documents.map((d) => ({
              podcast_id: podcastId,
              user_id: user.id,
              name: d.name,
              storage_path: d.storage_path || '',
              page_count: Array.isArray((d as any).page_images) ? (d as any).page_images.length : 0,
              page_images: (d as any).page_images || [],
            }))
          )

        if (insertDocsError) {
          const looksLikeMissingMigration =
            (insertDocsError as any).code === '42P01' ||
            /relation\s+"intelligent_podcast_documents"\s+does not exist/i.test(String(insertDocsError.message || ''))
          const looksLikeMissingColumn =
            (insertDocsError as any).code === '42703' ||
            /column\s+"page_images"\s+does not exist/i.test(String(insertDocsError.message || ''))
          throw new Error(
            looksLikeMissingMigration
              ? 'Missing table intelligent_podcast_documents. Apply migration 020_intelligent_podcast_documents_and_transcriptions.sql as postgres/supabase_admin.'
              : looksLikeMissingColumn
                ? 'Missing column intelligent_podcast_documents.page_images. Apply migration 021_intelligent_podcast_document_page_images.sql.'
              : `Failed to create podcast documents: ${insertDocsError.message}`
          )
        }

        const refetch = await supabase
          .from('intelligent_podcast_documents')
          .select('id,name,storage_path,page_count,page_images')
          .eq('podcast_id', podcastId)
          .eq('user_id', user.id)
          .order('created_at', { ascending: true })
        docRows = refetch.data || []
      }

      if (!docRows || docRows.length === 0) {
        throw new Error(
          'No source documents found for this podcast. If you just uploaded PDFs, hard refresh and re-upload. If you are self-hosting, also ensure migration 020_intelligent_podcast_documents_and_transcriptions.sql was applied.'
        )
      }

      const missingImages = docRows.filter((d: any) => !Array.isArray(d.page_images) || d.page_images.length === 0)
      if (missingImages.length > 0) {
        throw new Error(
          'Some documents have no page images. Please re-upload so the client can convert PDFs to images. If you are self-hosting, ensure migration 021_intelligent_podcast_document_page_images.sql was applied.'
        )
      }

      // Ensure page_count is known for each document based on stored page_images
      for (const doc of docRows) {
        const images = Array.isArray((doc as any).page_images) ? (doc as any).page_images : []
        const computedCount = images.length
        if (Number(doc.page_count) === computedCount) continue
        await supabase
          .from('intelligent_podcast_documents')
          .update({ page_count: computedCount })
          .eq('id', doc.id)
          .eq('user_id', user.id)
        doc.page_count = computedCount
      }

      const totalPages = docRows.reduce((sum, d) => sum + Math.max(0, Number(d.page_count) || 0), 0)
      if (totalPages <= 0) throw new Error('Could not determine total PDF pages')

      // Load existing transcriptions (to resume)
      const { data: existingPages, error: existingPagesError } = await supabase
        .from('intelligent_podcast_page_transcriptions')
        .select('document_id,page_number')
        .eq('podcast_id', podcastId)
        .eq('user_id', user.id)

      if (existingPagesError) {
        const looksLikeMissingMigration =
          (existingPagesError as any).code === '42P01' ||
          /relation\s+"intelligent_podcast_page_transcriptions"\s+does not exist/i.test(
            String(existingPagesError.message || '')
          )
        throw new Error(
          looksLikeMissingMigration
            ? 'Missing table intelligent_podcast_page_transcriptions. Apply migration 020_intelligent_podcast_documents_and_transcriptions.sql as postgres/supabase_admin.'
            : `Failed to load transcriptions: ${existingPagesError.message}`
        )
      }

      const doneByDoc = new Map<string, Set<number>>()
      for (const d of docRows) doneByDoc.set(d.id, new Set<number>())
      for (const row of existingPages || []) {
        const set = doneByDoc.get(row.document_id as any)
        if (set) set.add(Number(row.page_number))
      }

      const donePagesCount = Array.from(doneByDoc.values()).reduce((sum, s) => sum + s.size, 0)
      const pctWithinTranscription = totalPages > 0 ? donePagesCount / totalPages : 0
      await updateProgress(
        10 + Math.round(pctWithinTranscription * 25),
        `Transcription: ${donePagesCount}/${totalPages} pages`
      )

      // Pick a small batch of pages to transcribe in this invocation (keeps it resumable)
      const TRANSCRIPTION_BATCH_PAGES = 5
      const selected: Array<{ doc: any; pages: number[] }> = []
      let selectedCount = 0

      for (const doc of docRows) {
        if (selectedCount >= TRANSCRIPTION_BATCH_PAGES) break

        const pageCount = Math.max(0, Number(doc.page_count) || 0)
        const doneSet = doneByDoc.get(doc.id) || new Set<number>()
        const remainingPages: number[] = []
        for (let p = 1; p <= pageCount; p++) {
          if (!doneSet.has(p)) remainingPages.push(p)
          if (remainingPages.length >= TRANSCRIPTION_BATCH_PAGES - selectedCount) break
        }
        if (remainingPages.length > 0) {
          selected.push({ doc, pages: remainingPages })
          selectedCount += remainingPages.length
        }
      }

      // If there are still pages to transcribe, do just this batch and return.
      if (selectedCount > 0) {
        for (const item of selected) {
          const doc = item.doc
          const images = Array.isArray(doc.page_images) ? doc.page_images : []
          const byPage: Record<number, string> = {}
          for (const img of images) {
            if (typeof img?.page_number === 'number' && typeof img?.url === 'string') {
              byPage[img.page_number] = img.url
            }
          }
          await updateProgress(
            10 + Math.round((donePagesCount / totalPages) * 25),
            `Transcribing: ${doc.name} (pages ${item.pages.join(', ')})`
          )

          for (const pageNum of item.pages) {
            const imageUrl = byPage[pageNum]
            if (!imageUrl) {
              throw new Error(`Missing page image for ${doc.name} page ${pageNum}`)
            }
            let text = ''
            try {
              text = await transcribePageImageWithOpenAI({
                documentName: doc.name,
                pageNumber: pageNum,
                imageUrl,
              })
            } catch (e: any) {
              console.error(`[Podcast ${podcastId}] Transcription failed for ${doc.name} page ${pageNum}:`, e)
              text = `[[TRANSCRIPTION FAILED]]\nDocument: ${doc.name}\nPage: ${pageNum}\nError: ${String(
                e?.message || e
              )}`
            }

            await supabase
              .from('intelligent_podcast_page_transcriptions')
              .upsert(
                {
                  podcast_id: podcastId,
                  document_id: doc.id,
                  user_id: user.id,
                  page_number: pageNum,
                  transcription: text,
                },
                { onConflict: 'document_id,page_number' }
              )
          }
        }

        // Return early; the frontend polling loop will call /process again until done.
        return NextResponse.json({ success: true, status: 'generating', stage: 'transcribing' })
      }

      // All pages transcribed -> assemble full document contents
      await updateProgress(35, 'Transcription complete. Assembling full text...')
      const extractedDocuments: DocumentContent[] = []

      for (const doc of docRows) {
        const { data: pages } = await supabase
          .from('intelligent_podcast_page_transcriptions')
          .select('page_number,transcription')
          .eq('document_id', doc.id)
          .eq('podcast_id', podcastId)
          .eq('user_id', user.id)
          .order('page_number', { ascending: true })

        const content = (pages || [])
          .map((p: any) => `--- Page ${p.page_number} ---\n${String(p.transcription || '').trim()}`)
          .join('\n\n')

        extractedDocuments.push({
          id: doc.id,
          title: doc.name,
          content,
          pageCount: Number(doc.page_count) || 0,
          language: 'auto',
          extractedAt: new Date().toISOString(),
        })
      }

      // Upload full transcript (optional but useful for debugging / UX)
      try {
        const fullTranscript = extractedDocuments
          .map((d) => `=== DOCUMENT: ${d.title} ===\n${d.content}`)
          .join('\n\n')
        const transcriptPath = `${user.id}/intelligent-podcasts/${podcastId}/transcript.txt`
        await supabase.storage
          .from('podcast-documents')
          .upload(transcriptPath, Buffer.from(fullTranscript, 'utf-8'), {
            contentType: 'text/plain; charset=utf-8',
            upsert: true,
          })

        const { data: publicData } = supabase.storage.from('podcast-documents').getPublicUrl(transcriptPath)
        await supabase
          .from('intelligent_podcasts')
          .update({ transcript_url: publicData.publicUrl })
          .eq('id', podcastId)
          .eq('user_id', user.id)
      } catch (e: any) {
        console.warn('[Podcast] Transcript upload failed (non-fatal):', e?.message || e)
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
        userPrompt: String(config?.userPrompt || ''),
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
