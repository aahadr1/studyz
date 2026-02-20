/**
 * Self-generating greeting audio files for instant Q&A transitions.
 *
 * GET /api/intelligent-podcast/greetings
 *   Returns public URLs for greeting WAV files.
 *   On first request, auto-generates 5 FR + 5 EN files via Gemini TTS
 *   and uploads them to Supabase Storage. Subsequent requests just return URLs.
 *
 * POST /api/intelligent-podcast/greetings
 *   Force-regenerates all greeting files (useful to update voices/text).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const maxDuration = 120 // First request generates 10 TTS files

const GEMINI_TTS_MODEL = 'gemini-2.5-flash-preview-tts'
const VOICE_NAME = 'Aoede'
const SAMPLE_RATE = 24000

const GREETINGS: Record<string, string[]> = {
  fr: [
    "Oh, on dirait qu'on a une question ! Vas-y, je t'écoute.",
    "Ah, une question ! Parfait, dis-moi.",
    "Oh, quelqu'un veut poser une question ! Je t'écoute.",
    "Tiens, une question ! Vas-y, je suis tout ouïe.",
    "On fait une petite pause, il y a une question ! Vas-y.",
  ],
  en: [
    "Oh, looks like we have a question! Go ahead, I'm listening.",
    "A question! Perfect, go ahead.",
    "Oh, someone wants to ask something! I'm all ears.",
    "Hey, a question! Sure, what's on your mind?",
    "We're pausing for a question! Go ahead, I'm listening.",
  ],
}

function getGeminiKey(): string {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY is not set')
  return key
}

async function generateTTS(text: string): Promise<Buffer> {
  const apiKey = getGeminiKey()
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: VOICE_NAME },
          },
        },
      },
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`TTS failed (${res.status}): ${errText.substring(0, 200)}`)
  }

  const data = await res.json()
  const audioBase64 = data.candidates
    ?.flatMap((c: any) => c.content?.parts || [])
    ?.map((p: any) => p.inlineData?.data || p.inline_data?.data)
    ?.find((d: any) => !!d)

  if (!audioBase64) throw new Error('No audio data in TTS response')

  // Convert PCM to WAV
  const pcmBuf = Buffer.from(audioBase64, 'base64')
  return pcmToWav(pcmBuf, SAMPLE_RATE)
}

function pcmToWav(pcmBuf: Buffer, sampleRate: number): Buffer {
  const numChannels = 1
  const bitsPerSample = 16
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8)
  const blockAlign = numChannels * (bitsPerSample / 8)
  const dataSize = pcmBuf.length

  const wav = Buffer.alloc(44 + dataSize)
  wav.write('RIFF', 0)
  wav.writeUInt32LE(36 + dataSize, 4)
  wav.write('WAVE', 8)
  wav.write('fmt ', 12)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(numChannels, 22)
  wav.writeUInt32LE(sampleRate, 24)
  wav.writeUInt32LE(byteRate, 28)
  wav.writeUInt16LE(blockAlign, 32)
  wav.writeUInt16LE(bitsPerSample, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(dataSize, 40)
  pcmBuf.copy(wav, 44)

  return wav
}

async function createSupabaseClient() {
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

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseClient()

    const results: Record<string, string[]> = { fr: [], en: [] }

    for (const [lang, texts] of Object.entries(GREETINGS)) {
      for (let i = 0; i < texts.length; i++) {
        const fileName = `greetings/${lang}_${i + 1}.wav`
        console.log(`[Greetings] Generating ${fileName}...`)

        const wavBuffer = await generateTTS(texts[i])

        // Upload to Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from('podcast-documents')
          .upload(fileName, wavBuffer, {
            contentType: 'audio/wav',
            upsert: true,
          })

        if (uploadError) {
          console.error(`[Greetings] Upload failed for ${fileName}:`, uploadError)
          throw new Error(`Upload failed: ${uploadError.message}`)
        }

        const { data: publicData } = supabase.storage
          .from('podcast-documents')
          .getPublicUrl(fileName)

        results[lang].push(publicData.publicUrl)
        console.log(`[Greetings] ✓ ${fileName} (${(wavBuffer.length / 1024).toFixed(0)}KB)`)

        // Rate limit delay
        if (i < texts.length - 1) {
          await new Promise(r => setTimeout(r, 500))
        }
      }
    }

    return NextResponse.json({ success: true, urls: results })
  } catch (err: any) {
    console.error('[Greetings] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET: Return greeting URLs — auto-generates on first request if files don't exist
export async function GET() {
  try {
    const supabase = await createSupabaseClient()

    // Check if greetings already exist by trying to download the first file
    const { data: existingFile } = await supabase.storage
      .from('podcast-documents')
      .download('greetings/fr_1.wav')

    if (!existingFile || existingFile.size === 0) {
      // Files don't exist yet — generate them now
      console.log('[Greetings] No greeting files found, generating...')

      for (const [lang, texts] of Object.entries(GREETINGS)) {
        for (let i = 0; i < texts.length; i++) {
          const fileName = `greetings/${lang}_${i + 1}.wav`
          console.log(`[Greetings] Generating ${fileName}...`)

          const wavBuffer = await generateTTS(texts[i])

          const { error: uploadError } = await supabase.storage
            .from('podcast-documents')
            .upload(fileName, wavBuffer, {
              contentType: 'audio/wav',
              upsert: true,
            })

          if (uploadError) {
            console.error(`[Greetings] Upload failed for ${fileName}:`, uploadError)
            throw new Error(`Upload failed: ${uploadError.message}`)
          }

          console.log(`[Greetings] ✓ ${fileName} (${(wavBuffer.length / 1024).toFixed(0)}KB)`)

          // Rate limit delay
          if (i < texts.length - 1 || lang === 'fr') {
            await new Promise(r => setTimeout(r, 500))
          }
        }
      }

      console.log('[Greetings] All greeting files generated and uploaded!')
    }

    // Return public URLs
    const results: Record<string, string[]> = { fr: [], en: [] }

    for (const lang of ['fr', 'en']) {
      for (let i = 1; i <= 5; i++) {
        const fileName = `greetings/${lang}_${i}.wav`
        const { data: publicData } = supabase.storage
          .from('podcast-documents')
          .getPublicUrl(fileName)
        results[lang].push(publicData.publicUrl)
      }
    }

    return NextResponse.json({ urls: results })
  } catch (err: any) {
    console.error('[Greetings] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
