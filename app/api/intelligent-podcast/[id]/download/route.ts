import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import JSZip from 'jszip'

export const runtime = 'nodejs'
export const maxDuration = 300 // zip creation + downloads

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

function safeFilename(name: string) {
  return name
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 120)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createAuthClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: podcast, error } = await supabase
      .from('intelligent_podcasts')
      .select('id,title,status,segments')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (error || !podcast) {
      return NextResponse.json({ error: 'Podcast not found' }, { status: 404 })
    }

    if (podcast.status !== 'ready') {
      return NextResponse.json({ error: 'Podcast not ready yet' }, { status: 409 })
    }

    const segments = Array.isArray(podcast.segments) ? podcast.segments : []
    const audioSegments = segments.filter((s: any) => typeof s?.audioUrl === 'string' && s.audioUrl.length > 0)

    if (audioSegments.length === 0) {
      return NextResponse.json({ error: 'No audio available for this podcast' }, { status: 404 })
    }

    const zip = new JSZip()

    // Include a simple transcript file as well
    const transcriptLines = segments.map((s: any) => {
      const speaker = s?.speaker || 'speaker'
      const text = s?.text || ''
      return `${speaker.toUpperCase()}: ${text}`
    })
    zip.file('transcript.txt', transcriptLines.join('\n\n'))

    // Fetch each audio file and add to zip
    for (let i = 0; i < audioSegments.length; i++) {
      const seg = audioSegments[i]
      const speaker = String(seg.speaker || 'speaker')
      const url = String(seg.audioUrl)

      const res = await fetch(url)
      if (!res.ok) {
        throw new Error(`Failed to fetch audio segment ${i + 1}: ${res.status}`)
      }

      const arr = await res.arrayBuffer()
      const buf = Buffer.from(arr)

      // Prefer mp3 extension; if content-type indicates wav, use wav.
      const contentType = res.headers.get('content-type') || ''
      const ext = contentType.includes('wav') ? 'wav' : 'mp3'
      const filename = `${String(i + 1).padStart(3, '0')}-${speaker}.${ext}`

      zip.file(filename, buf)
    }

    const title = safeFilename(podcast.title || 'podcast')
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
    const body = new Uint8Array(zipBuffer)

    return new NextResponse(body, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${title}.zip"`,
        'Cache-Control': 'private, max-age=0, no-cache',
      },
    })
  } catch (error: any) {
    console.error('[Podcast Download] Error:', error)
    return NextResponse.json(
      { error: 'Failed to generate download', details: error.message },
      { status: 500 }
    )
  }
}

