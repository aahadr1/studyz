import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export const runtime = 'nodejs'
export const maxDuration = 60

let _openai: OpenAI | null = null
function getOpenAI() {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return _openai
}

// POST /api/stt - Speech-to-text transcription for recorded audio
export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'AI is not configured on the server (missing OPENAI_API_KEY)' }, { status: 500 })
    }

    const body = await request.json()
    const { audioBase64, mimeType, language } = body as {
      audioBase64?: string
      mimeType?: string
      language?: string
    }

    if (!audioBase64 || typeof audioBase64 !== 'string') {
      return NextResponse.json({ error: 'audioBase64 is required' }, { status: 400 })
    }

    const cleaned = audioBase64.includes(',') ? audioBase64.split(',')[1] : audioBase64
    const buf = Buffer.from(cleaned, 'base64')

    const file = new File([buf], 'audio.webm', { type: mimeType || 'audio/webm' })

    const transcript = await getOpenAI().audio.transcriptions.create({
      model: 'whisper-1',
      file,
      ...(language ? { language } : {}),
    })

    return NextResponse.json({ text: transcript.text || '' })
  } catch (error: any) {
    console.error('STT error:', error)
    return NextResponse.json(
      { error: 'Failed to transcribe audio', details: error?.message },
      { status: 500 }
    )
  }
}

