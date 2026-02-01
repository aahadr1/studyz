import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

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
    if (!process.env.REPLICATE_API_TOKEN) {
      console.error('[Podcast] REPLICATE_API_TOKEN is not set')
      return NextResponse.json(
        {
          error: 'Server configuration error',
          details: 'Replicate API token is not configured (required for Gemini OCR + script generation)',
        },
        { status: 500 }
      )
    }

    if (!process.env.OPENAI_API_KEY) {
      // Still required for OpenAI TTS + TTS text cleanup used in the audio pipeline
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
      userPrompt = '',
    } = body as {
      documents?: Array<{
        name: string
        storage_path: string
      }>
      targetDuration?: number
      language?: string
      style?: 'educational' | 'conversational' | 'technical' | 'storytelling'
      voiceProvider?: 'openai' | 'elevenlabs' | 'playht'
      userPrompt?: string
    }

    if (!documents || documents.length === 0) {
      return NextResponse.json({ error: 'At least one document is required' }, { status: 400 })
    }

    // Fail fast if the client is sending the legacy payload (page_images) instead of storage_path.
    const missingStoragePath = documents.filter((d: any) => typeof d?.storage_path !== 'string' || d.storage_path.trim().length === 0)
    if (missingStoragePath.length > 0) {
      return NextResponse.json(
        {
          error: 'Invalid documents payload',
          details:
            'This endpoint expects PDFs already uploaded to Supabase Storage. Please hard refresh the page and re-upload your PDFs (documents[].storage_path is required).',
        },
        { status: 400 }
      )
    }

    console.log(`[Podcast] Starting generation for ${documents.length} document(s)`)
    console.log(`[Podcast] User: ${user.id}, Style: ${style}, Duration: ${targetDuration}min`)

    // Create podcast record with "pending" status - will be processed separately
    const placeholderTitle = documents.map(d => d.name.replace(/\.pdf$/i, '')).join(', ')
    const { data: podcast, error: insertError } = await supabase
      .from('intelligent_podcasts')
      .insert({
        user_id: user.id,
        title: placeholderTitle,
        description: 'Waiting to start...',
        duration: 0,
        language: language === 'auto' ? 'en' : language,
        document_ids: documents.map((d) => d.storage_path),
        knowledge_graph: { concepts: [], relationships: [], embeddings: {} },
        chapters: [],
        segments: [],
        predicted_questions: [],
        status: 'pending',
        generation_progress: 0,
      })
      .select()
      .single()

    if (insertError || !podcast) {
      console.error('[Podcast] Failed to create podcast record:', insertError)
      console.error('[Podcast] Insert error details:', JSON.stringify(insertError, null, 2))
      return NextResponse.json({ 
        error: 'Failed to create podcast', 
        details: insertError?.message || insertError?.hint || 'Database insert failed',
        code: insertError?.code
      }, { status: 500 })
    }

    console.log(`[Podcast] Created podcast ${podcast.id} with pending status`)

    // Persist source document references (for resumability)
    const { error: docsError } = await supabase
      .from('intelligent_podcast_documents')
      .insert(
        documents.map((d) => ({
          podcast_id: podcast.id,
          user_id: user.id,
          name: d.name,
          storage_path: d.storage_path,
          page_count: 0,
        }))
      )

    if (docsError) {
      console.error('[Podcast] Failed to create document rows:', docsError)

      // Mark podcast errored so UI doesn't keep retrying blindly
      await supabase
        .from('intelligent_podcasts')
        .update({ status: 'error', description: `Erreur: ${docsError.message}` })
        .eq('id', podcast.id)

      const looksLikeMissingMigration =
        docsError.code === '42P01' || /relation\s+"intelligent_podcast_documents"\s+does not exist/i.test(docsError.message || '')

      return NextResponse.json(
        {
          error: 'Database is missing required tables',
          details: looksLikeMissingMigration
            ? 'Missing table intelligent_podcast_documents. Apply migration 020_intelligent_podcast_documents_and_transcriptions.sql as the postgres/supabase_admin role.'
            : docsError.message,
        },
        { status: 500 }
      )
    }

    // Return immediately with podcast ID and processing config
    return NextResponse.json({
      id: podcast.id,
      status: 'pending',
      message: 'Podcast record created, ready for processing',
      documents,
      config: {
        targetDuration,
        language,
        style,
        voiceProvider,
        userPrompt: String(userPrompt || ''),
      },
    })
  } catch (error: any) {
    console.error('[Podcast] Setup error:', error)
    return NextResponse.json({ error: 'Failed to start podcast generation', details: error.message }, { status: 500 })
  }
}
