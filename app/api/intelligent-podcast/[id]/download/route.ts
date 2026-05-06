import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'
export const maxDuration = 300

// WAV constants — must match TTS output (24kHz, 16-bit, mono)
const SAMPLE_RATE = 24000
const NUM_CHANNELS = 1
const BITS_PER_SAMPLE = 16
const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8
const WAV_HEADER_SIZE = 44

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

    const { data: { user }, error: authError } = await supabase.auth.getUser()
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
    const audioSegments = segments.filter(
      (s: any) => typeof s?.audioUrl === 'string' && s.audioUrl.length > 0
    )

    if (audioSegments.length === 0) {
      return NextResponse.json({ error: 'No audio available for this podcast' }, { status: 404 })
    }

    // Fetch all segment audio and extract raw PCM (strip WAV headers)
    const pcmChunks: Buffer[] = []

    for (let i = 0; i < audioSegments.length; i++) {
      const url = String(audioSegments[i].audioUrl)
      const res = await fetch(url)
      if (!res.ok) {
        throw new Error(`Failed to fetch audio segment ${i + 1}: ${res.status}`)
      }

      const buf = Buffer.from(await res.arrayBuffer())

      // Strip the 44-byte WAV header to get raw PCM
      if (buf.length > WAV_HEADER_SIZE) {
        pcmChunks.push(buf.slice(WAV_HEADER_SIZE))
      }
    }

    // Concatenate all PCM into one WAV
    const totalPcmBytes = pcmChunks.reduce((sum, c) => sum + c.length, 0)
    const wav = Buffer.alloc(WAV_HEADER_SIZE + totalPcmBytes)

    // Write WAV header
    const byteRate = SAMPLE_RATE * NUM_CHANNELS * BYTES_PER_SAMPLE
    const blockAlign = NUM_CHANNELS * BYTES_PER_SAMPLE

    wav.write('RIFF', 0)
    wav.writeUInt32LE(36 + totalPcmBytes, 4)
    wav.write('WAVE', 8)
    wav.write('fmt ', 12)
    wav.writeUInt32LE(16, 16)        // chunk size
    wav.writeUInt16LE(1, 20)         // PCM format
    wav.writeUInt16LE(NUM_CHANNELS, 22)
    wav.writeUInt32LE(SAMPLE_RATE, 24)
    wav.writeUInt32LE(byteRate, 28)
    wav.writeUInt16LE(blockAlign, 32)
    wav.writeUInt16LE(BITS_PER_SAMPLE, 34)
    wav.write('data', 36)
    wav.writeUInt32LE(totalPcmBytes, 40)

    // Copy PCM data
    let offset = WAV_HEADER_SIZE
    for (const chunk of pcmChunks) {
      chunk.copy(wav, offset)
      offset += chunk.length
    }

    const title = safeFilename(podcast.title || 'podcast')

    return new NextResponse(new Uint8Array(wav), {
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Disposition': `attachment; filename="${title}.wav"`,
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
