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

function createSimpleClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get() { return undefined },
        set() {},
        remove() {},
      },
    }
  )
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
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
    } = body as {
      documents?: Array<{
        name: string
        page_images: Array<{ page_number: number; url: string }>
      }>
      targetDuration?: number
      language?: string
      style?: 'educational' | 'conversational' | 'technical' | 'storytelling'
      voiceProvider?: 'openai' | 'elevenlabs' | 'playht'
    }

    if (!documents || documents.length === 0) {
      return NextResponse.json({ error: 'At least one document with page_images is required' }, { status: 400 })
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
        document_ids: documents.map(() => crypto.randomUUID()),
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
      },
    })
  } catch (error: any) {
    console.error('[Podcast] Setup error:', error)
    return NextResponse.json({ error: 'Failed to start podcast generation', details: error.message }, { status: 500 })
  }
}
