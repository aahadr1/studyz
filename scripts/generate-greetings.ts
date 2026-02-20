/**
 * Generate pre-recorded greeting audio files for instant Q&A transitions.
 *
 * Usage:
 *   GEMINI_API_KEY=your_key npx tsx scripts/generate-greetings.ts
 *
 * Generates 5 French + 5 English short greeting WAV files in public/audio/greetings/
 * using the same Gemini TTS voice (Aoede) as the podcast host Alex.
 */

import * as fs from 'fs'
import * as path from 'path'

const GEMINI_TTS_MODEL = 'gemini-2.5-flash-preview-tts'
const VOICE_NAME = 'Aoede' // Alex's voice
const SAMPLE_RATE = 24000
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'audio', 'greetings')

const GREETINGS = {
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

async function generateGreeting(text: string, outputPath: string): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is required')

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`

  const body = {
    contents: [{ parts: [{ text }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: VOICE_NAME },
        },
      },
    },
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Gemini TTS failed (${res.status}): ${errText.substring(0, 200)}`)
  }

  const data = await res.json()
  const audioBase64 = data.candidates
    ?.flatMap((c: any) => c.content?.parts || [])
    ?.map((p: any) => p.inlineData?.data || p.inline_data?.data)
    ?.find((d: any) => !!d)

  if (!audioBase64) throw new Error('No audio data in response')

  // Convert PCM base64 to WAV file
  const pcmBuf = Buffer.from(audioBase64, 'base64')
  const wavBuf = pcmToWav(pcmBuf, SAMPLE_RATE)
  fs.writeFileSync(outputPath, wavBuf)

  const durationSec = (pcmBuf.length / 2) / SAMPLE_RATE
  console.log(`  ✓ ${path.basename(outputPath)} (${durationSec.toFixed(1)}s, ${(wavBuf.length / 1024).toFixed(0)}KB)`)
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

async function main() {
  console.log('Generating greeting audio files...\n')

  fs.mkdirSync(OUTPUT_DIR, { recursive: true })

  for (const [lang, texts] of Object.entries(GREETINGS)) {
    console.log(`${lang.toUpperCase()}:`)
    for (let i = 0; i < texts.length; i++) {
      const outputPath = path.join(OUTPUT_DIR, `${lang}_${i + 1}.wav`)
      try {
        await generateGreeting(texts[i], outputPath)
      } catch (err: any) {
        console.error(`  ✗ ${lang}_${i + 1}.wav: ${err.message}`)
      }
      // Small delay to avoid rate limiting
      if (i < texts.length - 1) await new Promise(r => setTimeout(r, 500))
    }
    console.log()
  }

  console.log('Done! Files saved to public/audio/greetings/')
}

main().catch(console.error)
