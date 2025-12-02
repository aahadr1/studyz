import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'
export const maxDuration = 60

// MiniMax Speech-02-Turbo Voice IDs
const VOICES = {
  en: {
    male: 'English_CaptivatingStoryteller',
    female: 'English_ConfidentWoman',
  },
  fr: {
    male: 'French_MaleNarrator',
    female: 'French_Female_News Anchor',
  },
}

// Helper to create authenticated Supabase client
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

// Admin client for bypassing RLS
function getSupabaseAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Cache for model version
let cachedVersion: string | null = null

async function getLatestVersion(apiToken: string): Promise<string> {
  if (cachedVersion) return cachedVersion

  try {
    const response = await fetch('https://api.replicate.com/v1/models/minimax/speech-02-turbo', {
      headers: { 'Authorization': `Bearer ${apiToken}` }
    })
    
    if (response.ok) {
      const data = await response.json()
      cachedVersion = data.latest_version?.id
      if (cachedVersion) {
        return cachedVersion
      }
    }
  } catch (err) {
    console.error('[TTS] Failed to get latest version:', err)
  }

  // Fallback to known working version
  return '0544d2d437c9fdce5a5cf43a06b29f4df8a2c0bfef97f5c7f85a1f0c55b5eb06'
}

// POST: Generate audio for a single section and save to storage
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createAuthClient()
    const supabaseAdmin = getSupabaseAdmin()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const apiToken = process.env.REPLICATE_API_TOKEN
    if (!apiToken) {
      return NextResponse.json({ error: 'TTS not configured' }, { status: 503 })
    }

    // Verify lesson ownership
    const { data: lesson, error: lessonError } = await supabase
      .from('interactive_lessons')
      .select('id, user_id, language')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (lessonError || !lesson) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
    }

    const body = await request.json()
    const { page_number, total_pages, voice = 'male' } = body

    if (!page_number) {
      return NextResponse.json({ error: 'page_number is required' }, { status: 400 })
    }

    // Update status
    await supabaseAdmin
      .from('interactive_lessons')
      .update({
        lesson_status: 'processing',
        lesson_generation_step: 'audio',
        lesson_generation_progress: page_number,
        lesson_generation_total: total_pages || 1
      })
      .eq('id', id)

    // Get the section content
    const { data: section, error: sectionError } = await supabaseAdmin
      .from('interactive_lesson_page_sections')
      .select('id, section_title, section_content')
      .eq('interactive_lesson_id', id)
      .eq('page_number', page_number)
      .single()

    if (sectionError || !section) {
      return NextResponse.json({ error: `Section for page ${page_number} not found` }, { status: 404 })
    }

    // Prepare text for TTS
    const textForAudio = `${section.section_title}. <#0.5#> ${section.section_content}`
    const trimmedText = textForAudio.trim().substring(0, 10000)

    // Determine voice and language
    const language = (lesson.language === 'fr' ? 'fr' : 'en') as keyof typeof VOICES
    const voiceId = VOICES[language]?.[voice as keyof typeof VOICES.en] || VOICES.en.male
    const languageBoost = language === 'fr' ? 'French' : 'English'

    console.log(`[TTS] Generating audio for lesson ${id}, page ${page_number}`)

    // Get latest version
    const version = await getLatestVersion(apiToken)

    // Create prediction with Replicate
    const createResponse = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: version,
        input: {
          text: trimmedText,
          voice_id: voiceId,
          speed: 1,
          emotion: 'auto',
          pitch: 0,
          volume: 1,
          sample_rate: 32000,
          bitrate: 128000,
          audio_format: 'mp3',
          channel: 'mono',
          language_boost: languageBoost,
          english_normalization: language === 'en',
        }
      })
    })

    if (!createResponse.ok) {
      const errorText = await createResponse.text()
      console.error('[TTS] Create failed:', createResponse.status, errorText)
      return NextResponse.json({ error: 'TTS generation failed' }, { status: 500 })
    }

    let prediction = await createResponse.json()

    // Poll for completion (max 60 seconds)
    let attempts = 0
    while (prediction.status !== 'succeeded' && prediction.status !== 'failed' && attempts < 60) {
      await new Promise(r => setTimeout(r, 1000))
      
      const pollResponse = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
        headers: { 'Authorization': `Bearer ${apiToken}` }
      })
      
      prediction = await pollResponse.json()
      attempts++
    }

    if (prediction.status === 'failed' || !prediction.output) {
      console.error('[TTS] Failed:', prediction.error)
      return NextResponse.json({ error: 'TTS generation failed' }, { status: 500 })
    }

    // Download the audio file from Replicate
    const audioUrl = prediction.output
    const audioResponse = await fetch(audioUrl)
    
    if (!audioResponse.ok) {
      throw new Error('Failed to download audio file')
    }

    const audioBuffer = await audioResponse.arrayBuffer()

    // Upload to Supabase storage
    const audioPath = `${user.id}/${id}/audio/section-${page_number}.mp3`
    
    const { error: uploadError } = await supabaseAdmin.storage
      .from('interactive-lessons')
      .upload(audioPath, audioBuffer, {
        contentType: 'audio/mpeg',
        upsert: true,
      })

    if (uploadError) {
      console.error('[TTS] Upload error:', uploadError)
      throw new Error('Failed to upload audio file')
    }

    // Update section with audio path
    const { error: updateError } = await supabaseAdmin
      .from('interactive_lesson_page_sections')
      .update({
        audio_path: audioPath,
        audio_duration_seconds: Math.ceil(trimmedText.length / 15) // Rough estimate
      })
      .eq('id', section.id)

    if (updateError) {
      console.error('[TTS] Update error:', updateError)
    }

    console.log(`[TTS] Audio saved for lesson ${id}, page ${page_number}`)

    return NextResponse.json({
      success: true,
      page_number,
      audio_path: audioPath
    })

  } catch (error: any) {
    console.error('Error in POST /api/interactive-lessons/[id]/sections/generate-audio:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

