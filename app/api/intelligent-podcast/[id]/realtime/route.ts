import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { IntelligentPodcast } from '@/types/intelligent-podcast'
import { buildPodcastQASystemInstruction } from '@/lib/intelligent-podcast/gemini-live-client'

export const runtime = 'nodejs'

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

/**
 * Get context for real-time voice Q&A during podcast playback.
 * This endpoint prepares all the context needed for Gemini Live API.
 */
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

    const body = await request.json()
    const { currentSegmentId, currentTimestamp } = body as {
      currentSegmentId: string
      currentTimestamp: number
    }

    if (!currentSegmentId || currentTimestamp === undefined) {
      return NextResponse.json(
        { error: 'currentSegmentId and currentTimestamp are required' },
        { status: 400 }
      )
    }

    // Fetch podcast
    const { data: podcast, error } = await supabase
      .from('intelligent_podcasts')
      .select('*')
      .eq('id', podcastId)
      .eq('user_id', user.id)
      .single()

    if (error || !podcast) {
      return NextResponse.json({ error: 'Podcast not found' }, { status: 404 })
    }

    const podcastData = podcast as unknown as IntelligentPodcast

    // Find current segment index
    const currentIndex = podcastData.segments.findIndex((s) => s.id === currentSegmentId)
    if (currentIndex === -1) {
      return NextResponse.json({ error: 'Segment not found' }, { status: 404 })
    }

    // Get ALL segments up to current point (full context of what's been said)
    const segmentsUpToCurrent = podcastData.segments.slice(0, currentIndex + 1)
    
    // Build full transcript of what's been said so far
    const fullTranscript = segmentsUpToCurrent
      .map(seg => {
        const speaker = seg.speaker === 'host' ? 'Alex' : 'Jamie'
        return `${speaker}: ${seg.text}`
      })
      .join('\n\n')

    // Get recent segments for more immediate context (last 8-10)
    const recentSegments = segmentsUpToCurrent.slice(-10)
    const recentTranscript = recentSegments
      .map(seg => {
        const speaker = seg.speaker === 'host' ? 'Alex' : 'Jamie'
        return `${speaker}: ${seg.text}`
      })
      .join('\n\n')

    // Find current topic/chapter
    const currentTopic = podcastData.chapters.find(
      ch => currentTimestamp >= ch.startTime && currentTimestamp <= ch.endTime
    )

    // Get relevant concepts from recent segments
    const recentConceptIds = new Set<string>()
    recentSegments.forEach(seg => {
      seg.concepts.forEach(c => recentConceptIds.add(c))
    })
    const relevantConcepts = podcastData.knowledgeGraph.concepts
      .filter(c => recentConceptIds.has(c.id))
      .map(c => c.name)

    // Build system instruction for Gemini Live
    const systemInstruction = buildPodcastQASystemInstruction({
      podcastTitle: podcastData.title,
      language: podcastData.language,
      recentTranscript: recentTranscript,
      currentTopic: currentTopic?.title || 'General discussion',
      hostName: 'Alex',
    })

    // Build introduction message that Gemini will "say" when the user starts
    const introductionPrompt = podcastData.language === 'fr'
      ? `Oh, on a une question ! Je t'écoute, qu'est-ce que tu voulais savoir ?`
      : `Oh, looks like we have a question! I'm listening, what would you like to know?`

    // Build transition-back prompt for after answering
    const transitionBackPrompt = podcastData.language === 'fr'
      ? `Bon, on reprend où on en était ?`
      : `Alright, ready to get back to where we were?`

    return NextResponse.json({
      // Context for the client
      context: {
        podcastId,
        podcastTitle: podcastData.title,
        language: podcastData.language,
        currentSegmentId,
        currentTimestamp,
        currentTopic: currentTopic?.title || 'General discussion',
        relevantConcepts,
      },
      // System instruction for Gemini Live
      systemInstruction,
      // Full transcript for deep context (can be used to inject into system prompt if needed)
      fullTranscript: fullTranscript.slice(-8000), // Last ~8000 chars
      recentTranscript,
      // Pre-built prompts for smooth transitions
      introductionPrompt,
      transitionBackPrompt,
      // Voice to use (matches the podcast host voice)
      suggestedVoice: 'Aoede',
      // API key hint (client will use env var)
      useGeminiLive: true,
    })
  } catch (error: any) {
    console.error('[Realtime] Context preparation error:', error)
    return NextResponse.json(
      { error: 'Failed to prepare context', details: error.message },
      { status: 500 }
    )
  }
}
