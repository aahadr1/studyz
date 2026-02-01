import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

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
          } catch {}
        },
        remove(name: string, options: any) {
          try {
            cookieStore.set(name, '', options)
          } catch {}
        },
      },
    }
  )
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createAuthClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: podcast, error } = await supabase
      .from('intelligent_podcasts')
      .select('id, title, description, status, generation_progress, duration, created_at')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (error || !podcast) {
      return NextResponse.json({ error: 'Podcast not found' }, { status: 404 })
    }

    return NextResponse.json({
      id: podcast.id,
      title: podcast.title,
      description: podcast.description,
      status: podcast.status,
      progress: podcast.generation_progress || 0,
      duration: podcast.duration || 0,
      createdAt: podcast.created_at,
    })
  } catch (error: any) {
    console.error('[Podcast Status] Error:', error)
    return NextResponse.json({ error: 'Failed to get status' }, { status: 500 })
  }
}
