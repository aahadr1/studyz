import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { IntelligentPodcast, RealtimeConversationContext } from '@/types/intelligent-podcast'

export const runtime = 'nodejs'

/**
 * Get context for Realtime API conversation
 * This endpoint prepares all the context needed for the Realtime API session
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { currentSegmentId, currentTimestamp } = body as {
      currentSegmentId: string
      currentTimestamp: number
    }

    if (!currentSegmentId || currentTimestamp === undefined) {
      return NextResponse.json({ error: 'currentSegmentId and currentTimestamp are required' }, { status: 400 })
    }

    // Fetch podcast
    const { data: podcast, error } = await supabase
      .from('intelligent_podcasts')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single()

    if (error || !podcast) {
      return NextResponse.json({ error: 'Podcast not found' }, { status: 404 })
    }

    const podcastData = podcast as unknown as IntelligentPodcast

    // Find current segment
    const currentSegment = podcastData.segments.find((s) => s.id === currentSegmentId)
    if (!currentSegment) {
      return NextResponse.json({ error: 'Segment not found' }, { status: 404 })
    }

    // Get recent segments (last 3-5 for context)
    const currentIndex = podcastData.segments.findIndex((s) => s.id === currentSegmentId)
    const recentSegments = podcastData.segments.slice(Math.max(0, currentIndex - 4), currentIndex + 1)

    // Get relevant concepts from recent segments
    const recentConceptIds = new Set<string>()
    recentSegments.forEach((seg) => {
      seg.concepts.forEach((c) => recentConceptIds.add(c))
    })

    const relevantConcepts = podcastData.knowledgeGraph.concepts.filter((c) => recentConceptIds.has(c.id))

    // Fetch original documents (for deep context)
    // TODO: Fetch actual document contents from database
    const documentContents = podcastData.documentIds.map((id) => ({
      id,
      title: `Document ${id}`,
      content: 'Placeholder document content',
      pageCount: 10,
      language: podcastData.language,
      extractedAt: new Date().toISOString(),
    }))

    // Build context for Realtime API
    const context: RealtimeConversationContext = {
      podcastId: params.id,
      currentSegmentId,
      currentTimestamp,
      recentSegments,
      relevantConcepts,
      knowledgeGraph: podcastData.knowledgeGraph,
      documentContents,
    }

    // Generate instructions for Realtime API
    const instructions =
      podcastData.language === 'fr'
        ? `Tu es l'animateur du podcast "${podcastData.title}".

L'utilisateur a interrompu le podcast pour poser une question. Tu dois répondre de manière :
- CONCISE (2-3 phrases maximum)
- CONVERSATIONNELLE (comme dans le podcast)
- CONTEXTUELLE (en référence à ce qui vient d'être dit)

CONTEXTE ACTUEL :
On vient de parler de : ${recentSegments.map((s) => s.text.slice(0, 100)).join(' ... ')}

Concepts abordés : ${relevantConcepts.map((c) => c.name).join(', ')}

Si la question nécessite plus d'explications, propose à l'utilisateur :
- De revenir à un moment précis du podcast
- D'approfondir ce point après le podcast
- De reformuler sa question

Reste naturel et encourageant !`
        : `You are the podcast host for "${podcastData.title}".

The user has interrupted the podcast to ask a question. You should respond in a way that is:
- CONCISE (2-3 sentences maximum)
- CONVERSATIONAL (as in the podcast)
- CONTEXTUAL (referring to what was just discussed)

CURRENT CONTEXT:
We just talked about: ${recentSegments.map((s) => s.text.slice(0, 100)).join(' ... ')}

Concepts covered: ${relevantConcepts.map((c) => c.name).join(', ')}

If the question requires more explanation, suggest to the user:
- To go back to a specific moment in the podcast
- To deepen this point after the podcast
- To rephrase their question

Stay natural and encouraging!`

    return NextResponse.json({
      context,
      instructions,
      suggestedVoice: 'alloy', // OpenAI Realtime API voice
      recentTranscript: recentSegments.map((s) => s.text).join('\n\n'),
    })
  } catch (error: any) {
    console.error('[Realtime] Context preparation error:', error)
    return NextResponse.json({ error: 'Failed to prepare context', details: error.message }, { status: 500 })
  }
}
