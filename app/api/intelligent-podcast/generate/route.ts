import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { extractAndAnalyze } from '@/lib/intelligent-podcast/extractor'
import { generateIntelligentScript } from '@/lib/intelligent-podcast/script-generator'
import { generateMultiVoiceAudio, generatePredictedQuestionsAudio } from '@/lib/intelligent-podcast/audio-generator'
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
    const supabase = await createAuthClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      documentUrls,
      targetDuration = 30,
      language = 'auto',
      style = 'conversational',
      voiceProvider = 'openai',
    } = body as {
      documentUrls?: Array<{ url: string; name: string }>
      targetDuration?: number
      language?: string
      style?: 'educational' | 'conversational' | 'technical' | 'storytelling'
      voiceProvider?: 'openai' | 'elevenlabs' | 'playht'
    }

    if (!documentUrls || documentUrls.length === 0) {
      return NextResponse.json({ error: 'At least one document is required' }, { status: 400 })
    }

    console.log(`[Podcast] Starting generation for ${documentUrls.length} documents`)

    // AUTOMATIC PDF EXTRACTION
    const { extractTextFromPdfUrl } = await import('@/lib/intelligent-podcast/pdf-extractor')
    
    const documents: DocumentContent[] = []
    
    for (const doc of documentUrls) {
      try {
        console.log(`[Podcast] Extracting content from ${doc.name}...`)
        const { content, pageCount } = await extractTextFromPdfUrl(doc.url, doc.name)
        
        documents.push({
          id: crypto.randomUUID(),
          title: doc.name.replace('.pdf', ''),
          content,
          pageCount,
          language: 'auto', // Will be detected later
          extractedAt: new Date().toISOString(),
        })
        
        console.log(`[Podcast] ✅ ${doc.name}: ${content.length} chars, ${pageCount} pages`)
      } catch (error: any) {
        console.error(`[Podcast] Failed to extract ${doc.name}:`, error)
        return NextResponse.json({ 
          error: `Failed to extract content from ${doc.name}`, 
          details: error.message 
        }, { status: 500 })
      }
    }

    // STEP 1: Extract and analyze (build knowledge graph)
    console.log('[Podcast] Step 1/4: Extracting and analyzing content...')
    const { knowledgeGraph, detectedLanguage } = await extractAndAnalyze(documents)

    const finalLanguage = language === 'auto' ? detectedLanguage : language

    // STEP 2: Define voice profiles
    const voiceProfiles: VoiceProfile[] = [
      {
        id: 'host-voice',
        role: 'host',
        name: 'Sophie',
        provider: voiceProvider,
        voiceId: voiceProvider === 'openai' ? 'nova' : '21m00Tcm4TlvDq8ikWAM', // ElevenLabs Rachel
        description: 'Curious host who guides the conversation and asks clarifying questions',
      },
      {
        id: 'expert-voice',
        role: 'expert',
        name: 'Marcus',
        provider: voiceProvider,
        voiceId: voiceProvider === 'openai' ? 'onyx' : 'pNInz6obpgDQGcFmaJgB', // ElevenLabs Adam
        description: 'Deep expert who provides detailed insights and technical knowledge',
      },
      {
        id: 'simplifier-voice',
        role: 'simplifier',
        name: 'Emma',
        provider: voiceProvider,
        voiceId: voiceProvider === 'openai' ? 'shimmer' : 'EXAVITQu4vr4xnSDxMaL', // ElevenLabs Bella
        description: 'Friendly explainer who breaks down complex concepts into simple terms',
      },
    ]

    // STEP 3: Generate intelligent script
    console.log('[Podcast] Step 2/4: Generating intelligent script...')
    const { chapters, segments, predictedQuestions, title, description } = await generateIntelligentScript(
      documents,
      knowledgeGraph,
      {
        targetDuration,
        language: finalLanguage,
        style,
        voiceProfiles,
      }
    )

    // STEP 4: Generate audio for segments
    console.log('[Podcast] Step 3/4: Generating multi-voice audio...')
    const segmentsWithAudio = await generateMultiVoiceAudio(segments, voiceProfiles, finalLanguage, (current, total, step) => {
      console.log(`[Podcast] ${step}`)
    })

    // STEP 5: Pre-generate audio for predicted questions
    console.log('[Podcast] Step 4/4: Pre-generating Q&A audio...')
    const questionsWithAudio = await generatePredictedQuestionsAudio(
      predictedQuestions,
      finalLanguage,
      voiceProfiles[0], // Use host voice
      (current, total) => {
        console.log(`[Podcast] Q&A audio: ${current}/${total}`)
      }
    )

    // Calculate total duration
    const totalDuration = segmentsWithAudio.reduce((sum, seg) => sum + seg.duration, 0)

    // Save to database
    const { data: podcast, error: insertError } = await supabase
      .from('intelligent_podcasts')
      .insert({
        user_id: user.id,
        title,
        description,
        duration: Math.round(totalDuration),
        language: finalLanguage,
        document_ids: documents.map(d => d.id),
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

    console.log(`[Podcast] Generation completed successfully: ${podcast.id}`)

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
