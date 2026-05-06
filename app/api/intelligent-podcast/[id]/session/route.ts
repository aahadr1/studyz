import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

export const runtime = 'nodejs'

/**
 * Create or update a podcast session
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
    const {
      currentTime, // Frontend uses currentTime
      playbackRate = 1.0,
      isPlaying = false,
      completedSegments = [],
      completedChapters = [],
    } = body

    // Check if session exists
    const { data: existingSession } = await supabase
      .from('podcast_sessions')
      .select('*')
      .eq('podcast_id', params.id)
      .eq('user_id', user.id)
      .single()

    if (existingSession) {
      // Update existing session
      const { data: session, error } = await supabase
        .from('podcast_sessions')
        .update({
          current_position: currentTime, // Map currentTime to current_position
          playback_rate: playbackRate,
          is_playing: isPlaying,
          completed_segments: completedSegments,
          completed_chapters: completedChapters,
          last_accessed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingSession.id)
        .select()
        .single()

      if (error) {
        return NextResponse.json({ error: 'Failed to update session' }, { status: 500 })
      }

      return NextResponse.json(session)
    } else {
      // Create new session
      const { data: session, error } = await supabase
        .from('podcast_sessions')
        .insert({
          podcast_id: params.id,
          user_id: user.id,
          current_position: currentTime || 0, // Map currentTime to current_position
          playback_rate: playbackRate,
          is_playing: isPlaying,
          completed_segments: completedSegments,
          completed_chapters: completedChapters,
          progress_percentage: 0,
          interruptions: [],
          bookmarks: [],
          pause_count: 0,
          rewind_count: 0,
          difficult_segments: [],
        })
        .select()
        .single()

      if (error) {
        return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
      }

      return NextResponse.json(session)
    }
  } catch (error: any) {
    console.error('[Session] Error:', error)
    return NextResponse.json({ error: 'Session operation failed', details: error.message }, { status: 500 })
  }
}

/**
 * Get current session
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: session, error } = await supabase
      .from('podcast_sessions')
      .select('*')
      .eq('podcast_id', params.id)
      .eq('user_id', user.id)
      .single()

    if (error && error.code !== 'PGRST116') {
      return NextResponse.json({ error: 'Failed to fetch session' }, { status: 500 })
    }

    return NextResponse.json(session || null)
  } catch (error: any) {
    console.error('[Session] Fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch session', details: error.message }, { status: 500 })
  }
}
