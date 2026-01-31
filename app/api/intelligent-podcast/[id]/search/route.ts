import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { findSimilarConcepts } from '@/lib/intelligent-podcast/extractor'
import { IntelligentPodcast, SemanticSearchResult } from '@/types/intelligent-podcast'

export const runtime = 'nodejs'

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
    const { query } = body as { query: string }

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 })
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

    // Find similar concepts using semantic search
    const similarConcepts = await findSimilarConcepts(query, podcastData.knowledgeGraph, 5)

    // Find segments that discuss these concepts
    const results: SemanticSearchResult[] = []
    const conceptIds = similarConcepts.map((c) => c.id)

    podcastData.segments.forEach((segment) => {
      const matchingConcepts = segment.concepts.filter((c) => conceptIds.includes(c))
      if (matchingConcepts.length > 0) {
        results.push({
          segmentId: segment.id,
          timestamp: segment.timestamp,
          relevance: matchingConcepts.length / conceptIds.length,
          snippet: segment.text.slice(0, 200) + '...',
          concepts: matchingConcepts,
        })
      }
    })

    // Sort by relevance
    results.sort((a, b) => b.relevance - a.relevance)

    return NextResponse.json({
      query,
      results: results.slice(0, 10),
      concepts: similarConcepts,
    })
  } catch (error: any) {
    console.error('[Podcast] Search error:', error)
    return NextResponse.json({ error: 'Search failed', details: error.message }, { status: 500 })
  }
}
